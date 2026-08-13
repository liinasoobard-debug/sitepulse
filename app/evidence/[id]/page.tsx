import EvidenceDetailClient from "@/components/evidence/EvidenceDetailClient";
export default async function EvidenceDetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <EvidenceDetailClient id={id}/>;}
