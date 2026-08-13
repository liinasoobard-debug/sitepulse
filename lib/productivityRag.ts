import { calculateProductivityFactor, type ProductivityFactorThresholds } from "./manDayProductivity.ts";

export type ProductivityRag = "green" | "amber" | "red" | "baseline-missing" | "no-actuals";

export const productivityRagLabels: Record<ProductivityRag, string> = {
  green: "Green",
  amber: "Amber",
  red: "Red",
  "baseline-missing": "Baseline Missing",
  "no-actuals": "No Actuals",
};

export function productivityPerformance(planned?: number | null, actual?: number | null): number | null {
  const baseline = Number(planned);
  const achieved = Number(actual);
  return Number.isFinite(baseline) && baseline > 0 && Number.isFinite(achieved) && achieved >= 0 ? achieved / baseline * 100 : null;
}

export function productivityRag(planned?: number | null, actual?: number | null, thresholds?: ProductivityFactorThresholds): ProductivityRag {
  if (!(Number(planned) > 0)) return "baseline-missing";
  if (actual === null || actual === undefined || !Number.isFinite(Number(actual))) return "no-actuals";
  const achieved = Number(actual);
  if (!(achieved > 0)) return "no-actuals";
  return calculateProductivityFactor(achieved, Number(planned), 1, thresholds).rag;
}

export function ragDistribution(statuses: ProductivityRag[]) {
  const counts = Object.fromEntries(Object.keys(productivityRagLabels).map((status) => [status, statuses.filter((value) => value === status).length])) as Record<ProductivityRag, number>;
  const ragTotal = counts.green + counts.amber + counts.red;
  const percent = (status: "green" | "amber" | "red") => ragTotal ? counts[status] / ragTotal * 100 : 0;
  return { counts, ragTotal, percentages: { green: percent("green"), amber: percent("amber"), red: percent("red") } };
}
