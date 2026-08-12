export type UtilisationRag = "GREEN" | "AMBER" | "RED" | "GREY";

const isoDate = (value: string) => new Date(`${value}T12:00:00Z`);

export function workingDaysBetween(from: string, to: string) {
  if (!from || !to || from >= to) return 0;
  const cursor = isoDate(from);
  const end = isoDate(to);
  let days = 0;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function plantUtilisation(input: {
  onHireDate?: string | null;
  lastUsedDate?: string | null;
  today: string;
  warningDays?: number;
  redDays?: number;
  activityComplete?: boolean;
  requiredToDate?: string | null;
  hasCurrentOrFutureAllocation?: boolean;
}) {
  const warningDays = input.warningDays ?? 3;
  const redDays = input.redDays ?? 5;
  const evidenceDate = input.lastUsedDate || input.onHireDate;
  const idleWorkingDays = evidenceDate
    ? workingDaysBetween(evidenceDate, input.today)
    : null;
  const reason = input.activityComplete
    ? "Linked programme activity is complete"
    : input.requiredToDate && input.requiredToDate < input.today
      ? "Required-to date has passed"
      : input.hasCurrentOrFutureAllocation === false
        ? "No active or future allocation"
        : idleWorkingDays !== null && idleWorkingDays >= redDays
          ? `No recorded Timeline use for ${idleWorkingDays} working days`
          : null;
  const rag: UtilisationRag = reason
    ? "RED"
    : idleWorkingDays === null
      ? "GREY"
      : idleWorkingDays >= warningDays
        ? "AMBER"
        : "GREEN";
  return { idleWorkingDays, rag, offHireReview: Boolean(reason), reason };
}

export function indicativeIdleExposure(input: {
  idleWorkingDays: number | null;
  dailyRate?: number | null;
  weeklyRate?: number | null;
}) {
  if (!input.idleWorkingDays || input.idleWorkingDays < 1) return null;
  if (input.dailyRate && input.dailyRate > 0)
    return input.idleWorkingDays * input.dailyRate;
  if (input.weeklyRate && input.weeklyRate > 0)
    return (input.idleWorkingDays / 5) * input.weeklyRate;
  return null;
}
