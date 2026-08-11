export type ForecastActivity = {
  id: string; name: string; productType?: string; plannedQuantity?: number; plannedFinish?: string;
  plannedManDayProductivity?: number; assumedGangSize?: number; calendar?: string; totalFloatDays?: number;
};
export type ProductiveRecord = { date: string; quantity: number; operatives: number; gangSize?: number };
export type DisruptionRecord = { date: string; category: string; lostLabourHours: number };
export type ForecastRelationship = { predecessorId: string; successorId: string; type: string; lag?: number; successorPlannedStart?: string };
export type ScenarioAssumptions = { name: string; productivityChangePercent: number; gangSize: number; disruptionExposurePercent: number; weekendWorking: boolean };
export type HistoricalDisruption = { category: string; relevantWorkingDays: number; affectedWorkingDays: number; occurrenceRate: number | null; events: number; averageLostHoursPerEvent: number; averageLostHoursPerAffectedDay: number; totalLostHours: number };

const DAY = 86_400_000;
const date = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const validPositive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
const isWorkingDay = (value: Date, weekendWorking: boolean) => weekendWorking || (value.getUTCDay() !== 0 && value.getUTCDay() !== 6);

export function workingDaysBetween(start: string, finish: string, weekendWorking = false): number {
  const first = date(start), last = date(finish);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0;
  let count = 0;
  for (let cursor = new Date(first); cursor <= last; cursor = new Date(cursor.getTime() + DAY)) if (isWorkingDay(cursor, weekendWorking)) count += 1;
  return count;
}

export function addWorkingDays(start: string, workingDays: number, weekendWorking = false): string {
  if (!(workingDays > 0)) return start;
  let remaining = Math.ceil(workingDays), cursor = date(start);
  while (remaining > 0) { cursor = new Date(cursor.getTime() + DAY); if (isWorkingDay(cursor, weekendWorking)) remaining -= 1; }
  return iso(cursor);
}

export function workingDayVariance(forecast: string, planned: string, weekendWorking = false): number {
  if (forecast === planned) return 0;
  if (forecast > planned) return workingDaysBetween(addWorkingDays(planned, 1, true), forecast, weekendWorking);
  return -workingDaysBetween(addWorkingDays(forecast, 1, true), planned, weekendWorking);
}

export function recentActuals(records: ProductiveRecord[], recentWorkingDays = 10) {
  const valid = records.filter((row) => row.date && validPositive(row.quantity) && validPositive(row.operatives));
  const dates = [...new Set(valid.map((row) => row.date))].sort().slice(-recentWorkingDays);
  const selected = valid.filter((row) => dates.includes(row.date));
  const quantity = selected.reduce((sum, row) => sum + row.quantity, 0), manDays = selected.reduce((sum, row) => sum + row.operatives, 0);
  return { start: dates[0], finish: dates.at(-1), workingDays: dates.length, quantity, manDays, productivity: manDays > 0 ? quantity / manDays : null, effectiveGangSize: dates.length ? manDays / dates.length : null };
}

export function historicalDisruptionStatistics(records: DisruptionRecord[], relevantStart: string | undefined, dataDate: string, weekendWorking = false): HistoricalDisruption[] {
  if (!relevantStart) return [];
  const relevantWorkingDays = workingDaysBetween(relevantStart, dataDate, weekendWorking);
  const grouped = new Map<string, DisruptionRecord[]>();
  records.filter((row) => row.date >= relevantStart && row.date <= dataDate).forEach((row) => grouped.set(row.category, [...(grouped.get(row.category) ?? []), row]));
  return [...grouped].map(([category, rows]) => { const affectedWorkingDays = new Set(rows.map((row) => row.date)).size, totalLostHours = rows.reduce((sum, row) => sum + Math.max(row.lostLabourHours, 0), 0); return { category, relevantWorkingDays, affectedWorkingDays, occurrenceRate: relevantWorkingDays > 0 ? affectedWorkingDays / relevantWorkingDays : null, events: rows.length, averageLostHoursPerEvent: rows.length ? totalLostHours / rows.length : 0, averageLostHoursPerAffectedDay: affectedWorkingDays ? totalLostHours / affectedWorkingDays : 0, totalLostHours }; }).sort((a, b) => b.totalLostHours - a.totalLostHours);
}

export function forecastScenario(activity: ForecastActivity, dataDate: string, cumulativeQuantity: number, currentProductivity: number | null, assumptions: ScenarioAssumptions) {
  const warnings: string[] = [];
  const plannedQuantity = Number(activity.plannedQuantity), plannedFinish = activity.plannedFinish;
  const remainingQuantity = validPositive(plannedQuantity) ? Math.max(plannedQuantity - Math.max(cumulativeQuantity, 0), 0) : null;
  const productivity = currentProductivity !== null && validPositive(currentProductivity) ? currentProductivity * (1 + assumptions.productivityChangePercent / 100) : null;
  const gangSize = Number(assumptions.gangSize), availability = Math.max(0, Math.min(1, 1 - assumptions.disruptionExposurePercent / 100));
  if (remainingQuantity === null) warnings.push("Missing planned quantity.");
  if (!plannedFinish) warnings.push("Missing planned finish.");
  if (!validPositive(productivity)) warnings.push("No valid recent actual productivity.");
  if (!validPositive(gangSize)) warnings.push("No valid effective gang size.");
  if (!(availability > 0)) warnings.push("Disruption exposure leaves no productive capacity.");
  if (remainingQuantity === 0) return { available: true, warnings, remainingQuantity: 0, productivity, gangSize, dailyGangOutput: productivity && validPositive(gangSize) ? productivity * gangSize : null, adjustedDailyCapacity: 0, remainingManDays: 0, forecastWorkingDays: 0, forecastFinish: dataDate, daysEarlyLate: plannedFinish ? workingDayVariance(dataDate, plannedFinish, assumptions.weekendWorking) : null, availability };
  if (remainingQuantity === null || !plannedFinish || !validPositive(productivity) || !validPositive(gangSize) || !(availability > 0)) return { available: false, warnings, message: "Forecast unavailable – insufficient data.", remainingQuantity, productivity, gangSize, dailyGangOutput: null, adjustedDailyCapacity: null, remainingManDays: null, forecastWorkingDays: null, forecastFinish: null, daysEarlyLate: null, availability };
  const remainingManDays = remainingQuantity / productivity!;
  const dailyGangOutput = productivity! * gangSize;
  const adjustedDailyCapacity = dailyGangOutput * availability;
  const forecastWorkingDays = remainingQuantity / adjustedDailyCapacity;
  const forecastFinish = addWorkingDays(dataDate, forecastWorkingDays, assumptions.weekendWorking);
  return { available: true, warnings, remainingQuantity, productivity, gangSize, dailyGangOutput, adjustedDailyCapacity, remainingManDays, forecastWorkingDays, forecastFinish, daysEarlyLate: workingDayVariance(forecastFinish, plannedFinish, assumptions.weekendWorking), availability };
}

export function recoveryRequirement(activity: ForecastActivity, dataDate: string, remainingQuantity: number, currentProductivity: number | null, gangSize: number, disruptionExposurePercent: number, weekendWorking = false) {
  const remainingWorkingDays = activity.plannedFinish ? workingDaysBetween(addWorkingDays(dataDate, 1, true), activity.plannedFinish, weekendWorking) : 0;
  const availability = Math.max(0, Math.min(1, 1 - disruptionExposurePercent / 100));
  if (!(remainingWorkingDays > 0) || !(remainingQuantity >= 0) || !(gangSize > 0) || !(availability > 0)) return { available: false, remainingWorkingDays, requiredProductivity: null, requiredDailyOutput: null, requiredAverageGangSize: null, requiredImprovementPercent: null, operationalGangSize: null };
  const requiredDailyOutput = remainingQuantity / remainingWorkingDays / availability;
  const requiredProductivity = requiredDailyOutput / gangSize;
  const requiredAverageGangSize = currentProductivity && currentProductivity > 0 ? requiredDailyOutput / currentProductivity : null;
  return { available: true, remainingWorkingDays, requiredProductivity, requiredDailyOutput, requiredAverageGangSize, requiredImprovementPercent: currentProductivity && currentProductivity > 0 ? (requiredProductivity / currentProductivity - 1) * 100 : null, operationalGangSize: requiredAverageGangSize === null ? null : Math.ceil(requiredAverageGangSize) };
}

export function downstreamImpact(activityId: string, forecastFinish: string | null, relationships: ForecastRelationship[]) {
  return relationships.filter((row) => row.predecessorId === activityId).map((row) => { const validFinishToStart = /^(?:FS|PR_FS|finish.?to.?start)$/i.test(row.type) && (!row.lag || row.lag === 0); const affected = Boolean(validFinishToStart && forecastFinish && row.successorPlannedStart && forecastFinish > row.successorPlannedStart); return { ...row, validFinishToStart, affected, label: affected ? "Potential downstream programme impact" : validFinishToStart ? "No current finish-to-start impact indicated" : "Relationship shown; propagation unavailable for this relationship/lag" }; });
}

export function floatAssessment(daysLate: number | null, totalFloatDays?: number) {
  if (totalFloatDays === undefined || daysLate === null) return { available: false, exceeds: false, message: "Float unavailable – criticality is not inferred." };
  const exceeds = daysLate > totalFloatDays;
  return { available: true, exceeds, message: exceeds ? "Forecast exceeds available float." : "Forecast remains within available float." };
}
