import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseP6Workbook, type CanonicalProgrammeImport, type HierarchyField, type HierarchyMapping, type WorkbookSheets } from "@/lib/programmeImport";
import { parseAstaWorkbook, parseSitePulseTemplate, type ProgrammeImportSource } from "@/lib/programmeImportAdapters";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const hierarchyLabels: Record<HierarchyField,string>={building:"Building",elevation:"Elevation",level:"Floor",gridline:"Gridline",workActivity:"Activity Name"};
async function insertBatches(supabase: Awaited<ReturnType<typeof createClient>>, table: string, rows: Record<string,unknown>[]) { for(let i=0;i<rows.length;i+=400){const {error}=await supabase.from(table).insert(rows.slice(i,i+400));if(error)throw new Error(`${table}: ${error.message}`);} }

export async function POST(request: Request) {
  const supabase = await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const form=await request.formData(); const file=form.get("file"); const projectId=String(form.get("projectId")??""); const building=String(form.get("building")??"").trim(); const sourceType=String(form.get("sourceType")??"p6-xlsx") as ProgrammeImportSource;
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".xlsx"))return NextResponse.json({error:"Select a valid .xlsx workbook."},{status:400});
  if(!["sitepulse-template","p6-xlsx","asta-xlsx"].includes(sourceType))return NextResponse.json({error:"Select a supported programme source."},{status:400});
  const {data:last}=await supabase.from("programme_imports").select("import_version").eq("project_id",projectId).order("import_version",{ascending:false}).limit(1).maybeSingle();
  const {data:published}=await supabase.from("programme_imports").select("id").eq("project_id",projectId).eq("status","published").maybeSingle();
  let knownIds:string[]=[]; let previousActivities:Record<string,unknown>[]=[]; if(published){const {data}=await supabase.from("programme_activities").select("*").eq("programme_import_id",published.id);previousActivities=(data??[]) as Record<string,unknown>[];knownIds=previousActivities.map(x=>String(x.external_activity_id));}
  const importId=crypto.randomUUID();
  try {
    const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true}); const sheets:WorkbookSheets={};
    workbook.SheetNames.forEach(name=>{const ws=workbook.Sheets[name];if(ws)sheets[name]=XLSX.utils.sheet_to_json<Record<string,unknown>>(ws,{defval:"",raw:true});});
    const empty:HierarchyMapping={building:building?`__constant__:${building}`:"",elevation:"",level:"",gridline:"",workActivity:""};
    let mapping:HierarchyMapping=empty; let parsed:CanonicalProgrammeImport;
    if(sourceType==="p6-xlsx") { const first=parseP6Workbook(sheets,projectId,importId,empty,knownIds); const candidates=first.availableColumns.map(column=>({column,key:`${column} ${first.columnLabels[column]??""}`.toLowerCase().replace(/[\s_-]+/g," ")})); mapping={...empty}; (Object.keys(mapping) as HierarchyField[]).forEach(field=>{if(mapping[field])return;const label=hierarchyLabels[field].toLowerCase();mapping[field]=candidates.find(c=>c.key.includes(label)||field==="level"&&c.key.includes("floor")||field==="workActivity"&&c.key.includes("activity name"))?.column??"";}); parsed=parseP6Workbook(sheets,projectId,importId,mapping,knownIds); }
    else parsed=sourceType==="sitepulse-template"?parseSitePulseTemplate(sheets,projectId,importId):parseAstaWorkbook(sheets,projectId,importId);
    const errors=parsed.issues.filter(i=>i.severity==="error");
    const incomingIds=new Set(parsed.activities.map(activity=>activity.programmeActivityId)); const missingPrevious=previousActivities.filter(activity=>!incomingIds.has(String(activity.external_activity_id)));
    const {error:importError}=await supabase.from("programme_imports").insert({id:importId,project_id:projectId,import_version:(last?.import_version??0)+1,source_filename:file.name,source_type:sourceType,data_date:parsed.dataDate||null,imported_by:user.id,status:errors.length?"failed":"draft",validation_summary:{issues:parsed.issues,missing_count:missingPrevious.length},mapping_config:mapping,activity_count:parsed.activities.length+missingPrevious.length,relationship_count:parsed.relationships.length,resource_count:parsed.resources.length,assignment_count:parsed.assignments.length});
    if(importError)throw new Error(`programme_imports: ${importError.message}`);
    if(errors.length)return NextResponse.json({
      importId,
      status:"failed",
      summary:{
        activities:parsed.activities.length,
        relationships:parsed.relationships.length,
        resources:parsed.resources.length,
        assignments:parsed.assignments.length,
        issues:parsed.issues,
      },
    },{status:422});
    const activityRows=parsed.activities.map(a=>({id:a.id,project_id:projectId,programme_import_id:importId,external_activity_id:a.programmeActivityId,activity_name:a.activityName||a.activity,activity_status:a.activityStatus||null,wbs_code:a.wbsCode||null,wbs_name:a.wbsPath||null,building:a.building||null,area:a.elevation||null,level:a.level||null,gridline:a.gridline||null,location:[a.building,a.elevation,a.level,a.gridline].filter(Boolean).join(" / ")||null,trade:a.trade||null,planned_start:a.plannedStart||null,planned_finish:a.plannedFinish||null,actual_start:a.actualStart||null,actual_finish:a.actualFinish||null,original_duration:a.originalDuration??null,remaining_duration:a.remainingDuration??null,percent_complete:a.physicalPercentComplete??null,planned_quantity:a.plannedQuantity||null,unit:a.unit||null,productivity_target:a.plannedProductionRate??null,planned_crew_size:a.plannedCrewSize??null,calendar_name:a.calendar||null,is_missing_from_latest:false,raw_data:{productType:a.productType||null,programmeStatus:a.status||null,budgetLabourHours:a.budgetLabourHours??null,sourceType,sourceFilename:file.name,importDate:new Date().toISOString(),importedBy:user.id}}));
    const missingRows=missingPrevious.map(previous=>{const {id:_id,programme_import_id:_old,created_at:_created,updated_at:_updated,...fields}=previous;void _id;void _old;void _created;void _updated;return {...fields,id:crypto.randomUUID(),programme_import_id:importId,is_missing_from_latest:true,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};});
    await insertBatches(supabase,"programme_activities",[...activityRows,...missingRows]);
    await insertBatches(supabase,"programme_relationships",parsed.relationships.map(x=>({project_id:projectId,programme_import_id:importId,predecessor_external_activity_id:x.predecessorActivityId,successor_external_activity_id:x.successorActivityId,relationship_type:x.relationshipType,lag:x.lag??null,raw_data:{}})));
    await insertBatches(supabase,"programme_resources",parsed.resources.map(x=>({project_id:projectId,programme_import_id:importId,external_resource_id:x.resourceId,resource_name:x.resourceName,resource_type:x.resourceType||null,unit:x.unitOfMeasure||null,raw_data:{}})));
    await insertBatches(supabase,"programme_assignments",parsed.assignments.map(x=>({project_id:projectId,programme_import_id:importId,activity_external_id:x.programmeActivityId,resource_external_id:x.resourceId,budgeted_units:x.budgetedLabourUnits??null,actual_units:x.actualLabourUnits??null,remaining_units:x.remainingLabourUnits??null,assignment_start:x.assignmentStart||null,assignment_finish:x.assignmentFinish||null,raw_data:{}})));
    const summary={activities:parsed.activities.length,relationships:parsed.relationships.length,resources:parsed.resources.length,assignments:parsed.assignments.length,issues:parsed.issues};
    return NextResponse.json({importId,status:"draft",filename:file.name,mapping,summary,activityCount:summary.activities,relationshipCount:summary.relationships,resourceCount:summary.resources,assignmentCount:summary.assignments});
  } catch(error) { console.error("Programme import failed",error); await supabase.from("programme_imports").update({status:"failed",validation_summary:{error:error instanceof Error?error.message:"Import failed"}}).eq("id",importId); return NextResponse.json({error:error instanceof Error?error.message:"Import failed"},{status:500}); }
}
