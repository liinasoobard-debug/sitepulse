import { calculateProductivityFactor, type ProductivityFactorThresholds } from "./manDayProductivity.ts";
import type { ActivityReadiness, ReadinessRag } from "./readiness.ts";
import type { TimelineEvent } from "../types/site.ts";

export type DailyPlanStatus = "DRAFT" | "COMMITTED" | "REVISED" | "CLOSED";
export type DailyPlanAllocation = {
  id: string; project_id: string; plan_date: string; gang_id: string; gang_name: string; programme_activity_external_id: string;
  building: string; elevation: string; level: string; product_type?: string | null; area_zone?: string | null; planned_operatives: number;
  target_quantity: number; unit: string; planned_man_day_productivity?: number | null; expected_gang_output?: number | null;
  target_productivity_factor?: number | null; target_rag: "GREEN" | "AMBER" | "RED" | "GREY"; readiness_status: string;
  readiness_rag: ReadinessRag; readiness_snapshot: unknown; warning_reason?: string | null; warning_narrative?: string | null;
  required_recovery_output?: number | null; notes?: string | null; plan_status: DailyPlanStatus; revision_number: number;
  created_by?: string | null; created_at: string; last_revised_by?: string | null; last_revised_at?: string | null;
};
export type DailyPlanRevision = { id: string; project_id: string; plan_date: string; revision_number: number; status: DailyPlanStatus; snapshot: DailyPlanAllocation[]; reason?: string | null; created_by?: string | null; created_at: string };
export type DailyPlanData = { allocations: DailyPlanAllocation[]; revisions: DailyPlanRevision[] };

export function expectedGangOutput(plannedManDayProductivity?: number | null, plannedOperatives?: number | null) { return Number(plannedManDayProductivity) > 0 && Number(plannedOperatives) > 0 ? Number(plannedManDayProductivity) * Number(plannedOperatives) : null; }
export function targetProductivityFactor(expectedOutput?: number | null, targetQuantity?: number | null) { return Number(expectedOutput) > 0 && Number(targetQuantity) > 0 ? Number(expectedOutput) / Number(targetQuantity) : null; }
export function targetRag(factor: number | null, thresholds: ProductivityFactorThresholds = { greenMax: 1, amberMax: 1.1 }) { return factor === null ? "GREY" as const : factor <= thresholds.greenMax ? "GREEN" as const : factor <= thresholds.amberMax ? "AMBER" as const : "RED" as const; }
export function targetMessage(expected: number | null, target: number, factor: number | null) { if (expected === null || factor === null) return "Productivity baseline unavailable; no expected output has been invented."; if (target > expected) return `Stretch target — approximately ${Math.round((target / expected - 1) * 100)}% above planned output.`; if (target < expected) return `Daily target is approximately ${Math.round((1 - target / expected) * 100)}% below expected gang output.`; return "Target matches the planned productivity expectation."; }
export function achievementRag(actual: number, target: number) { if (!(target > 0)) return "GREY" as const; const ratio = actual / target; return ratio >= 1 ? "GREEN" as const : ratio >= .9 ? "AMBER" as const : "RED" as const; }
export function allocationActual(allocation: DailyPlanAllocation, events: TimelineEvent[], thresholds?: ProductivityFactorThresholds) {
  const matching = events.filter(row => row.type === "work" && row.status === "completed" && row.crewId === allocation.gang_id && row.programmeActivityId === allocation.programme_activity_external_id);
  const actualQuantity = matching.reduce((sum,row)=>sum+Number(row.quantity??0),0), actualManDays = new Set(matching.flatMap(row=>row.affectedOperativeIds??[])).size;
  const factor = calculateProductivityFactor(actualQuantity, allocation.planned_man_day_productivity, actualManDays, thresholds);
  return { actualQuantity, targetVariance: actualQuantity-allocation.target_quantity, targetAchievement: allocation.target_quantity>0?actualQuantity/allocation.target_quantity*100:null, achievementRag: achievementRag(actualQuantity,allocation.target_quantity), earnedManDays: factor.earnedManDays, actualManDays: factor.actualManDays, productivityFactor: factor.productivityFactor, productivityRag: factor.rag };
}
export function readinessSnapshot(readiness: ActivityReadiness) { return { status: readiness.status, rag: readiness.rag, requirements: readiness.requirements, blockers: readiness.blockers, capturedAt: new Date().toISOString() }; }
export function nextWorkingDay(date: string) { const value=new Date(`${date}T12:00:00`); do value.setDate(value.getDate()+1); while([0,6].includes(value.getDay())); return value.toISOString().slice(0,10); }
