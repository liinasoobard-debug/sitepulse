"use client";
/* eslint-disable react-hooks/exhaustive-deps, @next/next/no-img-element */
import Link from "next/link";
import { useEffect,useState } from "react";
import EvidenceUploader from "./EvidenceUploader";
import { loadEvidence } from "@/lib/supabase/evidenceData";
import type { EvidenceContext,EvidenceRecord } from "@/lib/evidence";
export default function LinkedEvidence({context,allowUpload=true}:{context:EvidenceContext;allowUpload?:boolean}){
  const [rows,setRows]=useState<EvidenceRecord[]>([]);
  const refresh=()=>loadEvidence(context.projectId,context.recordId?{recordType:context.recordType,recordId:context.recordId}:{activity:context.programmeActivityId}).then(setRows).catch(()=>setRows([]));
  useEffect(()=>{void refresh()},[context.projectId,context.recordId,context.programmeActivityId,context.recordType]);
  return <section className="linked-evidence"><header><strong>Evidence / Photos</strong><Link href="/evidence">View all ({rows.length})</Link></header>{rows.length>0&&<div>{rows.slice(0,4).map(row=><Link href={`/evidence/${row.id}`} key={row.id}>{row.mime_type?.startsWith("image/")?<img src={row.signed_url} alt={row.description||row.category}/>:<span>Document</span>}</Link>)}</div>}{!rows.length&&<small>No linked evidence yet.</small>}{allowUpload&&<EvidenceUploader compact context={context} onUploaded={refresh}/>}</section>;
}
