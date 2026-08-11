import { productivityRagLabels, type ProductivityRag } from "@/lib/productivityRag";

const icons: Record<ProductivityRag, string> = { green: "●", amber: "▲", red: "■", "baseline-missing": "◇", "no-actuals": "○" };

export default function ProductivityRagBadge({ status }: { status: ProductivityRag }) {
  return <span className={`productivity-rag-badge ${status}`} aria-label={`Productivity RAG: ${productivityRagLabels[status]}`}><span aria-hidden="true">{icons[status]}</span>{productivityRagLabels[status]}</span>;
}
