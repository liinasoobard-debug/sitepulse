export type ProgrammeActualRecord = { date: string; quantity: number; completed: boolean };
export function deriveProgrammeActualDates(records: ProgrammeActualRecord[], plannedQuantity: number) {
  const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const actualStart = ordered[0]?.date;
  let installed = 0, actualFinish: string | undefined;
  for (const record of ordered) { if (record.completed) installed += Math.max(0, record.quantity); if (!actualFinish && plannedQuantity > 0 && installed >= plannedQuantity) actualFinish = record.date; }
  return { actualStart, actualFinish, installed, percentComplete: plannedQuantity > 0 ? Math.min(100, installed / plannedQuantity * 100) : 0 };
}
