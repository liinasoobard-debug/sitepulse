export type ForecastProductionRecord = { date: string; quantity: number; operatives?: number; disrupted?: boolean };
export type ForecastDisruptionRecord = { date: string; category: string; lostLabourHours: number };
export type ForecastRelationship = { predecessorId: string; successorId: string; type: string; lag?: number; successorPlannedStart?: string };
export type ForecastActivityInput = { id: string; name: string; plannedQuantity?: number; plannedFinish?: string; plannedManDayProductivity?: number; plannedDailyGangOutput?: number; calendar?: string; totalFloatDays?: number };

const DAY = 86_400_000;
const date = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
const percentile = (sorted: number[], fraction: number) => { if (!sorted.length) return null; const index = (sorted.length - 1) * fraction, lower = Math.floor(index), upper = Math.ceil(index); return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower); };
const median = (values: number[]) => percentile([...values].sort((a, b) => a - b), .5);

export function workingDays(start: string, finish: string, weekends = false): number {
  const first = date(start), last = date(finish); if (last < first || Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return 0;
  let count = 0; for (let cursor = first; cursor <= last; cursor = new Date(cursor.getTime() + DAY)) if (weekends || (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6)) count += 1; return count;
}
export function addWorkingDays(start: string, count: number, weekends = false) { let remaining = Math.ceil(Math.max(count, 0)), cursor = date(start); while (remaining) { cursor = new Date(cursor.getTime() + DAY); if (weekends || (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6)) remaining -= 1; } return iso(cursor); }
export function finishVariance(forecast: string | null, planned?: string, weekends = false) { if (!forecast || !planned) return null; if (forecast === planned) return 0; return forecast > planned ? workingDays(addWorkingDays(planned, 1, true), forecast, weekends) : -workingDays(addWorkingDays(forecast, 1, true), planned, weekends); }

export function dailyObservations(records: ForecastProductionRecord[]) {
  const grouped = new Map<string, { quantity: number; operatives: number; disrupted: boolean }>();
  records.filter((row) => row.date && positive(row.quantity)).forEach((row) => { const current = grouped.get(row.date) ?? { quantity: 0, operatives: 0, disrupted: false }; current.quantity += row.quantity; current.operatives += positive(row.operatives) ? Number(row.operatives) : 0; current.disrupted ||= Boolean(row.disrupted); grouped.set(row.date, current); });
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([observationDate, row]) => ({ date: observationDate, dailyOutput: row.quantity, manDayProductivity: row.operatives > 0 ? row.quantity / row.operatives : null, operatives: row.operatives, disrupted: row.disrupted }));
}

export function forecastConfidence(observations: number) { return observations > 10 ? "Higher" : observations >= 6 ? "Moderate" : observations >= 3 ? "Low" : "Very Low"; }

export function evidenceRates(records: ForecastProductionRecord[], recentDays = 10) {
  const observations = dailyObservations(records), recent = observations.slice(-recentDays), outputs = recent.map((row) => row.dailyOutput).sort((a, b) => a - b);
  const enoughForRange = outputs.length >= 6, likely = median(outputs), best = enoughForRange ? percentile(outputs, .75) : likely, worst = enoughForRange ? percentile(outputs, .25) : likely;
  const unaffected = recent.filter((row) => !row.disrupted).map((row) => row.dailyOutput), affected = recent.filter((row) => row.disrupted).map((row) => row.dailyOutput), occurrence = recent.length ? affected.length / recent.length : 0;
  const unaffectedMedian = median(unaffected), affectedMedian = median(affected);
  const productionOnly = unaffected.length >= 3 ? unaffectedMedian : likely;
  const riskAdjustedLikely = unaffectedMedian !== null && affectedMedian !== null ? unaffectedMedian * (1 - occurrence) + affectedMedian * occurrence : likely;
  const first = recent.slice(0, Math.floor(recent.length / 2)).map((row) => row.dailyOutput), second = recent.slice(Math.ceil(recent.length / 2)).map((row) => row.dailyOutput), firstMedian = median(first), secondMedian = median(second);
  const trendChange = firstMedian && secondMedian ? secondMedian / firstMedian - 1 : null;
  const trend = trendChange === null ? "Insufficient data" : trendChange > .05 ? "Improving" : trendChange < -.05 ? "Deteriorating" : "Stable";
  const manDayValues = recent.map((row) => row.manDayProductivity).filter((value): value is number => value !== null);
  return { observations, recent, count: recent.length, start: recent[0]?.date, finish: recent.at(-1)?.date, confidence: forecastConfidence(recent.length), enoughForRange, bestDailyOutput: best, likelyDailyOutput: riskAdjustedLikely, worstDailyOutput: worst, productionOnlyDailyOutput: productionOnly, bestSustainedDemonstratedOutput: best, actualManDayProductivity: median(manDayValues), trend, occurrenceRate: occurrence };
}

function caseForecast(dataDate: string, remaining: number | null, rate: number | null, plannedFinish?: string, weekends = false) {
  if (remaining === 0) return { available: true, rate, workingDaysRemaining: 0, finish: dataDate, variance: finishVariance(dataDate, plannedFinish, weekends) };
  if (remaining === null || !positive(rate) || !plannedFinish) return { available: false, rate, workingDaysRemaining: null, finish: null, variance: null };
  const workingDaysRemaining = remaining / rate!; const finish = addWorkingDays(dataDate, workingDaysRemaining, weekends); return { available: true, rate, workingDaysRemaining, finish, variance: finishVariance(finish, plannedFinish, weekends) };
}

export function forecastRag(variance: number | null, amberToleranceDays = 2) { return variance === null ? "unavailable" as const : variance <= 0 ? "green" as const : variance <= amberToleranceDays ? "amber" as const : "red" as const; }

export function buildEvidenceForecast(activity: ForecastActivityInput, dataDate: string, records: ForecastProductionRecord[], disruptions: ForecastDisruptionRecord[], weekends = false, amberToleranceDays = 2) {
  const rates = evidenceRates(records), cumulativeQuantity = records.filter((row) => positive(row.quantity)).reduce((sum, row) => sum + row.quantity, 0), plannedQuantity = Number(activity.plannedQuantity);
  const remainingQuantity = positive(plannedQuantity) ? Math.max(plannedQuantity - cumulativeQuantity, 0) : null;
  const best = caseForecast(dataDate, remainingQuantity, rates.bestDailyOutput, activity.plannedFinish, weekends), likely = caseForecast(dataDate, remainingQuantity, rates.likelyDailyOutput, activity.plannedFinish, weekends), worst = caseForecast(dataDate, remainingQuantity, rates.worstDailyOutput, activity.plannedFinish, weekends), productionOnly = caseForecast(dataDate, remainingQuantity, rates.productionOnlyDailyOutput, activity.plannedFinish, weekends);
  const remainingProgrammeWorkingDays = activity.plannedFinish ? workingDays(addWorkingDays(dataDate, 1, true), activity.plannedFinish, weekends) : 0;
  const requiredDailyOutput = remainingQuantity !== null && remainingProgrammeWorkingDays > 0 ? remainingQuantity / remainingProgrammeWorkingDays : remainingQuantity === 0 ? 0 : null;
  const currentSustained = rates.likelyDailyOutput, bestSustained = rates.bestSustainedDemonstratedOutput;
  const requiredImprovementPercent = requiredDailyOutput !== null && currentSustained && currentSustained > 0 ? (requiredDailyOutput / currentSustained - 1) * 100 : null;
  const recoveryStatus = requiredDailyOutput === null || bestSustained === null ? "insufficient-data" : requiredDailyOutput <= (currentSustained ?? 0) ? "on-track" : requiredDailyOutput <= bestSustained ? "demonstrated" : "not-yet-demonstrated";
  const requiredManDayProductivity = requiredDailyOutput !== null && rates.actualManDayProductivity && currentSustained ? requiredDailyOutput / currentSustained * rates.actualManDayProductivity : null;
  const disruptionStats = disruptionStatistics(disruptions, rates.start, dataDate, weekends);
  const totalLostHours = disruptionStats.reduce((sum, row) => sum + row.totalLostHours, 0), mainDisruption = disruptionStats[0];
  const plannedProductivity = Number(activity.plannedManDayProductivity), productivityPerformance = positive(plannedProductivity) && rates.actualManDayProductivity ? rates.actualManDayProductivity / plannedProductivity * 100 : null;
  const significantDisruption = rates.occurrenceRate >= .15, lowProductivity = productivityPerformance !== null && productivityPerformance < 90;
  const constraint = rates.count < 3 ? "INSUFFICIENT DATA" : requiredDailyOutput !== null && bestSustained !== null && requiredDailyOutput > bestSustained && !lowProductivity && !significantDisruption ? "PROGRAMME ASSUMPTION RISK" : lowProductivity && significantDisruption ? "MIXED CONSTRAINT" : lowProductivity ? "PRODUCTIVITY CONSTRAINT" : significantDisruption ? "DISRUPTION CONSTRAINT" : "PROGRAMME ASSUMPTION RISK";
  const opportunityFinish = productionOnly.finish && likely.finish && productionOnly.finish < likely.finish ? productionOnly.finish : null;
  return { activity, dataDate, cumulativeQuantity, remainingQuantity, rates, best, likely, worst, productionOnly, forecastRag: forecastRag(likely.variance, amberToleranceDays), remainingProgrammeWorkingDays, requiredDailyOutput, requiredManDayProductivity, requiredImprovementPercent, recoveryStatus, currentSustainedOutput: currentSustained, bestSustainedDemonstratedOutput: bestSustained, disruptionStats, totalLostHours, mainDisruption, productivityPerformance, constraint, opportunityFinish, opportunityWorkingDays: opportunityFinish && likely.finish ? Math.abs(finishVariance(opportunityFinish, likely.finish, weekends) ?? 0) : 0, warnings: [!positive(activity.plannedQuantity) ? "Missing planned quantity." : "", !activity.plannedFinish ? "Missing planned finish." : "", rates.count < 3 ? "Forecast confidence is very low/low because fewer than 3 valid production days exist." : ""].filter(Boolean) };
}

export function disruptionStatistics(records: ForecastDisruptionRecord[], relevantStart: string | undefined, dataDate: string, weekends = false) {
  if (!relevantStart) return [];
  const relevantWorkingDays = workingDays(relevantStart, dataDate, weekends), groups = new Map<string, ForecastDisruptionRecord[]>(); records.filter((row) => row.date >= relevantStart && row.date <= dataDate).forEach((row) => groups.set(row.category, [...(groups.get(row.category) ?? []), row]));
  return [...groups].map(([category, rows]) => { const affectedWorkingDays = new Set(rows.map((row) => row.date)).size, totalLostHours = rows.reduce((sum, row) => sum + Math.max(row.lostLabourHours, 0), 0); return { category, relevantWorkingDays, affectedWorkingDays, historicalOccurrenceRate: relevantWorkingDays ? affectedWorkingDays / relevantWorkingDays : null, eventCount: rows.length, totalLostHours, averageLostHoursPerEvent: rows.length ? totalLostHours / rows.length : 0, averageLostHoursPerAffectedDay: affectedWorkingDays ? totalLostHours / affectedWorkingDays : 0 }; }).sort((a, b) => b.totalLostHours - a.totalLostHours);
}

export function floatExposure(delay: number | null, totalFloatDays?: number) { if (delay === null || totalFloatDays === undefined) return { available: false, beyondFloat: null, message: "Programme impact cannot be confirmed because float information is unavailable." }; const beyondFloat = Math.max(delay - totalFloatDays, 0); return { available: true, beyondFloat, message: beyondFloat > 0 ? `${beyondFloat} working days beyond available float.` : "Forecast delay is within available float." }; }
export function directSuccessorImpact(activityId: string, likelyFinish: string | null, relationships: ForecastRelationship[]) { return relationships.filter((row) => row.predecessorId === activityId).map((row) => { const valid = /^(?:FS|PR_FS|finish.?to.?start)$/i.test(row.type) && (!row.lag || row.lag === 0); return { ...row, valid, exposed: Boolean(valid && likelyFinish && row.successorPlannedStart && likelyFinish > row.successorPlannedStart), label: valid ? "Potential downstream impact" : "Relationship available; propagation not applied" }; }); }
