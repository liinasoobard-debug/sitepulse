import { plannedWorkingDaysBetween } from "./manDayProductivity.ts";
import type { ProgrammeActivity } from "../types/site.ts";

export type V2DailyRecord = { id?: string; date: string; activityId: string; quantity: number; labourHours: number; men?: number; affectedHours?: number; manualLabour?: boolean; constrained?: boolean; constraintReason?: string; note?: string };
export type V2Productivity = { targetProductivity: number | null; earnedManDays: number | null; actualManDays: number | null; productivityFactor: number | null };

export function v2Productivity(activity: Pick<ProgrammeActivity, "plannedQuantity" | "plannedManDays" | "budgetLabourHours">, quantity: number, labourHours: number, hoursPerManDay: number): V2Productivity {
  const budgetedMd = Number(activity.plannedManDays) > 0 ? Number(activity.plannedManDays) : Number(activity.budgetLabourHours) > 0 && hoursPerManDay > 0 ? Number(activity.budgetLabourHours) / hoursPerManDay : 0;
  const targetProductivity = Number(activity.plannedQuantity) > 0 && budgetedMd > 0 ? Number(activity.plannedQuantity) / budgetedMd : null;
  const earnedManDays = targetProductivity ? Math.max(0, quantity) / targetProductivity : null;
  const actualManDays = hoursPerManDay > 0 ? Math.max(0, labourHours) / hoursPerManDay : null;
  const productivityFactor = earnedManDays !== null && actualManDays !== null && actualManDays > 0 ? earnedManDays / actualManDays : null;
  return { targetProductivity, earnedManDays, actualManDays, productivityFactor };
}

export function plannedQuantityToDate(activity: ProgrammeActivity, date: string) {
  if (!activity.plannedStart || !activity.plannedFinish || activity.plannedQuantity <= 0 || date < activity.plannedStart) return 0;
  const totalDays = plannedWorkingDaysBetween(activity.plannedStart, activity.plannedFinish);
  if (!totalDays) return 0;
  const elapsed = plannedWorkingDaysBetween(activity.plannedStart, date < activity.plannedFinish ? date : activity.plannedFinish) ?? 0;
  return Math.min(activity.plannedQuantity, activity.plannedQuantity * elapsed / totalDays);
}

export function programmePosition(activity: ProgrammeActivity, cumulativeQuantity: number, date: string) {
  const planned = plannedQuantityToDate(activity, date);
  return { planned, actual: cumulativeQuantity, variance: cumulativeQuantity - planned };
}
