export type CallOffInput = {
  requiredOnSiteDate?: string;
  plannedStart?: string;
  requirementLeadTime?: number;
  supplierProductLeadTime?: number;
  productTypeLeadTime?: number;
  projectLeadTime?: number;
  internalBuffer?: number;
  actualCallOffDate?: string;
  confirmedDeliveryDate?: string;
  actualDeliveryDate?: string;
  overrideDate?: string;
};

export type CallOffStatus =
  | "UPCOMING"
  | "DUE"
  | "OVERDUE"
  | "CALLED OFF"
  | "CONFIRMED"
  | "DELIVERED"
  | "INCOMPLETE";
export type CallOffRag = "GREEN" | "AMBER" | "RED" | "GREY";

const parse = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

export function subtractWorkingDays(
  value: string,
  days: number,
  weekends = false,
): string {
  const result = parse(value);
  let remaining = Math.max(0, Math.ceil(days));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() - 1);
    const day = result.getUTCDay();
    if (weekends || (day !== 0 && day !== 6)) remaining -= 1;
  }
  return iso(result);
}

export function resolveLeadTime(input: CallOffInput): {
  days: number | null;
  source: string;
} {
  const candidates: Array<[number | undefined, string]> = [
    [input.requirementLeadTime, "Material requirement"],
    [input.supplierProductLeadTime, "Supplier/product"],
    [input.productTypeLeadTime, "Product type default"],
    [input.projectLeadTime, "Project default"],
  ];
  const match = candidates.find(
    ([value]) => Number.isFinite(value) && Number(value) >= 0,
  );
  return match
    ? { days: Number(match[0]), source: match[1] }
    : { days: null, source: "Lead time required" };
}

export function calculateCallOff(
  input: CallOffInput,
  today: string,
  warningDays = 5,
  weekends = false,
) {
  const requiredDate = input.requiredOnSiteDate || input.plannedStart || null;
  const lead = resolveLeadTime(input);
  const calculatedDate =
    requiredDate && lead.days !== null
      ? subtractWorkingDays(
          requiredDate,
          lead.days + Math.max(0, input.internalBuffer ?? 0),
          weekends,
        )
      : null;
  const recommendedDate = input.overrideDate || calculatedDate;
  let status: CallOffStatus = "INCOMPLETE";
  if (input.actualDeliveryDate) status = "DELIVERED";
  else if (input.confirmedDeliveryDate) status = "CONFIRMED";
  else if (input.actualCallOffDate) status = "CALLED OFF";
  else if (recommendedDate) {
    const warningBoundary = new Date(parse(today));
    warningBoundary.setUTCDate(warningBoundary.getUTCDate() + warningDays);
    status =
      recommendedDate < today
        ? "OVERDUE"
        : recommendedDate <= iso(warningBoundary)
          ? "DUE"
          : "UPCOMING";
  }
  let rag: CallOffRag = "GREY";
  if (
    requiredDate &&
    input.confirmedDeliveryDate &&
    input.confirmedDeliveryDate > requiredDate
  )
    rag = "RED";
  else if (status === "OVERDUE") rag = "RED";
  else if (
    status === "DUE" ||
    (status === "CONFIRMED" && !input.actualDeliveryDate)
  )
    rag = "AMBER";
  else if (["UPCOMING", "CALLED OFF", "DELIVERED"].includes(status))
    rag = "GREEN";
  return {
    requiredDate,
    leadTime: lead.days,
    leadTimeSource: lead.source,
    calculatedDate,
    recommendedDate,
    status,
    rag,
  };
}
