export const evidenceCategories = ["Progress","Constraint","Access","Handover","Delivery","Material","Plant","Quality","Damage","Change / VO","Safety","Other"] as const;
export type EvidenceCategory = typeof evidenceCategories[number];
export type EvidenceRecordType = "timeline"|"constraint"|"handover"|"programme_activity"|"daily_plan"|"material"|"plant"|"other";

export type EvidenceContext = {
  projectId:string; projectCode?:string; programmeActivityId?:string; activityName?:string;
  building?:string; elevation?:string; level?:string; area?:string; productType?:string; gangId?:string;
  recordType:EvidenceRecordType; recordId?:string; category?:EvidenceCategory; description?:string; capturedAt?:string|null;
};
export type EvidenceRecord = {
  id:string; project_id:string; programme_activity_id:string|null; building:string|null; elevation:string|null; level:string|null; area:string|null;
  product_type:string|null; gang_id:string|null; record_type:EvidenceRecordType; record_id:string|null; category:EvidenceCategory; description:string|null;
  captured_at:string|null; uploaded_at:string; uploaded_by:string; original_filename:string; generated_display_filename:string; storage_path:string;
  mime_type:string|null; file_size:number; signed_url?:string; uploader_name?:string;
};

export function safeFilenamePart(value:string|undefined, fallback="NA") {
  const safe=(value||"").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48);
  return safe||fallback;
}
export function extensionFor(file:{name:string;type?:string}) {
  const named=file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase();
  if(named) return named;
  return ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","application/pdf":"pdf"} as Record<string,string>)[file.type||""]||"bin";
}
export function generatedEvidenceFilename(context:EvidenceContext,file:{name:string;type?:string},effectiveAt:string) {
  const date=new Date(effectiveAt); const iso=date.toISOString();
  const day=iso.slice(0,10),time=iso.slice(11,19).replaceAll(":","-");
  const location=[context.projectCode,context.building,context.elevation,context.level,context.activityName||context.programmeActivityId,context.description||context.category]
    .map((part)=>safeFilenamePart(part)).filter((part)=>part!=="NA").join("_");
  return `${day}_${location||"SitePulse-Evidence"}_${time}.${extensionFor(file)}`;
}
export function evidenceStoragePath(context:EvidenceContext,file:{name:string;type?:string},uniqueId:string,effectiveAt:string) {
  const date=new Date(effectiveAt), activity=safeFilenamePart(context.programmeActivityId,"unlinked");
  return `${context.projectId}/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${String(date.getUTCDate()).padStart(2,"0")}/${activity}/${uniqueId}.${extensionFor(file)}`;
}

function exifText(bytes:Uint8Array,offset:number,length:number){return new TextDecoder("ascii").decode(bytes.slice(offset,offset+length)).replace(/\0/g,"").trim();}
export async function capturedAtFromFile(file:File):Promise<string|null>{
  if(!/jpe?g/i.test(file.type)&&!/\.jpe?g$/i.test(file.name)) return null;
  try {
    const bytes=new Uint8Array(await file.arrayBuffer());
    for(let i=2;i+10<bytes.length;){
      if(bytes[i]!==0xff) break; const marker=bytes[i+1],size=(bytes[i+2]<<8)+bytes[i+3];
      if(marker===0xe1&&exifText(bytes,i+4,6)==="Exif"){
        const t=i+10,little=exifText(bytes,t,2)==="II",view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const u16=(p:number)=>view.getUint16(p,little),u32=(p:number)=>view.getUint32(p,little); const ifd=t+u32(t+4),count=u16(ifd);
        let exifOffset=0;
        for(let n=0;n<count;n++){const p=ifd+2+n*12;if(u16(p)===0x8769) exifOffset=t+u32(p+8);}
        if(exifOffset){const c=u16(exifOffset);for(let n=0;n<c;n++){const p=exifOffset+2+n*12;if(u16(p)===0x9003){const len=u32(p+4),value=t+u32(p+8),raw=exifText(bytes,value,len);const m=raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;}}}
      }
      if(size<2) break;i+=2+size;
    }
  } catch { return null; }
  return null;
}
