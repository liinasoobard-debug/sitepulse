export type ProgrammeActualRecord = { date: string; quantity: number; completed: boolean };
export function deriveProgrammeActualDates(records: ProgrammeActualRecord[], plannedQuantity: number) {
  const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const actualStart = ordered[0]?.date;
  let installed = 0, actualFinish: string | undefined;
  for (const record of ordered) { if (record.completed) installed += Math.max(0, record.quantity); if (!actualFinish && plannedQuantity > 0 && installed >= plannedQuantity) actualFinish = record.date; }
  return { actualStart, actualFinish, installed, percentComplete: plannedQuantity > 0 ? Math.min(100, installed / plannedQuantity * 100) : 0 };
}

export type ImportedProgrammeActuals = {
  actualStart?: string | null;
  actualFinish?: string | null;
  percentComplete?: number | null;
  status?: string | null;
};

// Programme evidence takes precedence; daily records fill gaps, never erase it.
export function resolveProgrammeActuals(records: ProgrammeActualRecord[], plannedQuantity: number, imported: ImportedProgrammeActuals) {
  const derived = deriveProgrammeActualDates(records, plannedQuantity);
  const actualStart = imported.actualStart || derived.actualStart;
  const actualFinish = imported.actualFinish || derived.actualFinish;
  const completed = Boolean(actualFinish) || (imported.percentComplete ?? 0) >= 100 || derived.percentComplete >= 100 || /^(completed|tk_complete)$/i.test(imported.status ?? "");
  const percentComplete = completed ? 100 : Math.max(imported.percentComplete ?? 0, derived.percentComplete);
  const status = completed ? "Completed" : actualStart || percentComplete > 0 || /^(in progress|active|tk_active)$/i.test(imported.status ?? "") ? "In Progress" : "Not Started";
  return { actualStart, actualFinish, percentComplete, status };
}
