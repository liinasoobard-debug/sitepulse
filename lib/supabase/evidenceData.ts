"use client";
import { createClient } from "@/lib/supabase/client";
import { capturedAtFromFile,evidenceStoragePath,generatedEvidenceFilename,type EvidenceCategory,type EvidenceContext,type EvidenceRecord } from "@/lib/evidence";

export type EvidenceFilters={from?:string;to?:string;building?:string;elevation?:string;level?:string;activity?:string;productType?:string;gang?:string;category?:string;recordType?:string;uploadedBy?:string;search?:string;recordId?:string};
export async function loadEvidence(projectId:string,filters:EvidenceFilters={}){
  const db=createClient(); let query=db.from("evidence_records").select("*").eq("project_id",projectId);
  if(filters.from) query=query.gte("uploaded_at",`${filters.from}T00:00:00`); if(filters.to) query=query.lte("uploaded_at",`${filters.to}T23:59:59.999`);
  const equal:[keyof EvidenceFilters,string][]=[["building","building"],["elevation","elevation"],["level","level"],["activity","programme_activity_id"],["productType","product_type"],["gang","gang_id"],["category","category"],["recordType","record_type"],["uploadedBy","uploaded_by"],["recordId","record_id"]];
  for(const [filter,column] of equal) if(filters[filter]) query=query.eq(column,filters[filter]!);
  if(filters.search) query=query.or(`description.ilike.%${filters.search.replace(/[%(),]/g,"")}%,generated_display_filename.ilike.%${filters.search.replace(/[%(),]/g,"")}%`);
  const {data,error}=await query.order("captured_at",{ascending:false,nullsFirst:false}).order("uploaded_at",{ascending:false}); if(error) throw error;
  const rows=(data??[]) as EvidenceRecord[];
  await Promise.all(rows.map(async row=>{const {data:signed}=await db.storage.from("sitepulse-evidence").createSignedUrl(row.storage_path,900);row.signed_url=signed?.signedUrl;}));
  return rows;
}
export async function loadEvidenceRecord(projectId:string,id:string){return (await loadEvidence(projectId)).find(row=>row.id===id)||null;}
export async function uploadEvidence(file:File,context:EvidenceContext,category:EvidenceCategory=context.category||"Progress",description=context.description||""){
  const db=createClient(),{data:user}=await db.auth.getUser(); if(!user.user) throw new Error("You must be signed in.");
  const uploadedAt=new Date().toISOString(),capturedAt=context.capturedAt===undefined?await capturedAtFromFile(file):context.capturedAt;
  const effectiveAt=capturedAt||uploadedAt,id=crypto.randomUUID(),storagePath=evidenceStoragePath(context,file,id,effectiveAt),displayName=generatedEvidenceFilename({...context,category,description},file,effectiveAt);
  const {error:uploadError}=await db.storage.from("sitepulse-evidence").upload(storagePath,file,{contentType:file.type||undefined}); if(uploadError) throw uploadError;
  const row={project_id:context.projectId,programme_activity_id:context.programmeActivityId||null,building:context.building||null,elevation:context.elevation||null,level:context.level||null,area:context.area||null,product_type:context.productType||null,gang_id:context.gangId||null,record_type:context.recordType,record_id:context.recordId||null,category,description:description.trim()||null,captured_at:capturedAt||null,uploaded_at:uploadedAt,uploaded_by:user.user.id,original_filename:file.name,generated_display_filename:displayName,storage_path:storagePath,mime_type:file.type||null,file_size:file.size};
  const {data,error}=await db.from("evidence_records").insert(row).select("*").single(); if(error){await db.storage.from("sitepulse-evidence").remove([storagePath]);throw error;} return data as EvidenceRecord;
}
export async function evidenceDownloadUrl(row:EvidenceRecord){const {data,error}=await createClient().storage.from("sitepulse-evidence").createSignedUrl(row.storage_path,60,{download:row.generated_display_filename});if(error)throw error;return data.signedUrl;}
