import { effectiveConstraintRag, type ConstraintActivityLink, type ConstraintRecord } from "./constraints.ts";
import type { ProgrammeActivity } from "../types/site.ts";

export type ReadinessStatus = "NOT READY" | "PARTIALLY RELEASED" | "READY" | "STARTED" | "COMPLETE";
export type ReadinessRag = "RED" | "AMBER" | "GREEN" | "GREY";
export type ReleaseStatus = "NOT RELEASED" | "PARTIALLY RELEASED" | "RELEASED" | "REVOKED";
export type ReleaseType = "Client Handover" | "Main Contractor Handover" | "Area Release" | "Access Release" | "Predecessor Completion" | "Design Release" | "Inspection / Approval" | "Other";

export type ReleaseRecord = {
  id: string; project_id: string; release_type: ReleaseType; title: string; building?: string | null; elevation?: string | null; level?: string | null;
  area_zone?: string | null; description?: string | null; planned_release_date?: string | null; actual_release_date?: string | null; released_by_name?: string | null;
  responsible_organisation?: string | null; reference?: string | null; status: ReleaseStatus; notes?: string | null; created_by?: string | null; created_at: string; updated_at: string;
};
export type ReleaseActivityLink = { release_id: string; project_id: string; programme_activity_external_id: string };
export type OperationalDependency = { id: string; project_id: string; predecessor_external_activity_id: string; successor_external_activity_id: string; description?: string | null; active: boolean };
export type SiteCompletion = { id: string; project_id: string; programme_activity_external_id: string; completed_at: string; completed_by?: string | null; quantity?: number | null; notes?: string | null; evidence_count?: number };
export type ProceedException = { id: string; project_id: string; programme_activity_external_id: string; issue_type: string; issue_reference?: string | null; occurred_at: string; reason: string; area_zone?: string | null; known_constraints?: unknown; timeline_event_id?: string | null };
export type ReleaseEvidence = { id: string; project_id: string; release_id?: string | null; programme_activity_external_id: string; storage_path: string; file_name: string; file_type?: string | null; file_size?: number | null; uploaded_by?: string | null; uploaded_at: string; signed_url?: string };
export type ReadinessAudit = { id: string; project_id: string; event_type: string; entity_type: string; entity_id: string; old_value?: unknown; new_value?: unknown; reason?: string | null; changed_by?: string | null; changed_at: string };
export type ReadinessData = { releases: ReleaseRecord[]; releaseLinks: ReleaseActivityLink[]; dependencies: OperationalDependency[]; completions: SiteCompletion[]; exceptions: ProceedException[]; evidence: ReleaseEvidence[]; audit: ReadinessAudit[] };
export type ProgrammeRelationshipLike = { predecessorId: string; successorId: string; type: string; lag?: number };
export type ReadinessRequirement = { key: "predecessors" | "release" | "materials" | "plant" | "constraints"; label: string; rag: ReadinessRag; detail: string };
export type ActivityReadiness = { activityId: string; status: ReadinessStatus; rag: ReadinessRag; releaseStatus: ReleaseStatus; requirements: ReadinessRequirement[]; blockers: string[]; actualRelease?: string; siteCompletedAt?: string; actualSiteStart?: string };

const open = (row: ConstraintRecord) => !["CLOSED", "DISMISSED"].includes(row.status);
const finished = (activity: ProgrammeActivity | undefined, completions: SiteCompletion[]) => Boolean(activity && (completions.some((row) => row.programme_activity_external_id === activity.programmeActivityId) || activity.actualFinish || (activity.physicalPercentComplete ?? 0) >= 100));

export function activityReadiness(input: {
  activity: ProgrammeActivity; activities: ProgrammeActivity[]; relationships: ProgrammeRelationshipLike[]; data: ReadinessData;
  constraints?: ConstraintRecord[]; constraintLinks?: ConstraintActivityLink[]; materialRag?: ReadinessRag; plantRag?: ReadinessRag; actualSiteStart?: string; today: string;
}): ActivityReadiness {
  const { activity, activities, relationships, data, today } = input;
  const programmePredecessors = relationships.filter((row) => row.successorId === activity.programmeActivityId && /^(?:FS|PR_FS|finish.?to.?start)$/i.test(row.type)).map((row) => row.predecessorId);
  const operationalPredecessors = data.dependencies.filter((row) => row.active && row.successor_external_activity_id === activity.programmeActivityId).map((row) => row.predecessor_external_activity_id);
  const predecessorIds = [...new Set([...programmePredecessors, ...operationalPredecessors])];
  const incomplete = predecessorIds.filter((id) => !finished(activities.find((row) => row.programmeActivityId === id), data.completions));
  const linkedReleaseIds = data.releaseLinks.filter((row) => row.programme_activity_external_id === activity.programmeActivityId).map((row) => row.release_id);
  const releases = data.releases.filter((row) => linkedReleaseIds.includes(row.id));
  const releaseStatus: ReleaseStatus = releases.some((row) => row.status === "NOT RELEASED" || row.status === "REVOKED") ? "NOT RELEASED" : releases.some((row) => row.status === "PARTIALLY RELEASED") ? "PARTIALLY RELEASED" : releases.length && releases.every((row) => row.status === "RELEASED") ? "RELEASED" : "NOT RELEASED";
  const blockingConstraintIds = new Set((input.constraintLinks ?? []).filter((row) => row.programme_activity_external_id === activity.programmeActivityId && row.blocking_relationship.startsWith("Blocking")).map((row) => row.constraint_id));
  const blockingConstraints = (input.constraints ?? []).filter((row) => blockingConstraintIds.has(row.id) && open(row) && effectiveConstraintRag(row, today).effective === "RED");
  const requirements: ReadinessRequirement[] = [
    { key: "predecessors", label: "Predecessors", rag: incomplete.length ? "RED" : "GREEN", detail: incomplete.length ? `${incomplete.length} predecessor${incomplete.length === 1 ? "" : "s"} not Site Complete` : predecessorIds.length ? "Complete" : "None required" },
    { key: "release", label: "Handover / Release", rag: !releases.length ? "GREY" : releaseStatus === "RELEASED" ? "GREEN" : releaseStatus === "PARTIALLY RELEASED" ? "AMBER" : "RED", detail: !releases.length ? "No release requirement configured" : releaseStatus },
    { key: "materials", label: "Materials", rag: input.materialRag ?? "GREY", detail: input.materialRag ? input.materialRag : "No linked readiness evidence" },
    { key: "plant", label: "Plant", rag: input.plantRag ?? "GREY", detail: input.plantRag ? input.plantRag : "No linked readiness evidence" },
    { key: "constraints", label: "Constraints", rag: blockingConstraints.length ? "RED" : "GREEN", detail: blockingConstraints.length ? `${blockingConstraints.length} open RED blocker${blockingConstraints.length === 1 ? "" : "s"}` : "No open RED blockers" },
  ];
  const completion = data.completions.find((row) => row.programme_activity_external_id === activity.programmeActivityId);
  const actualRelease = releases.flatMap((row) => row.actual_release_date ? [row.actual_release_date] : []).sort().at(-1);
  const blockers = [...incomplete.map((id) => `Predecessor ${activities.find((row) => row.programmeActivityId === id)?.activity || id} is not Site Complete`), ...releases.filter((row) => row.status !== "RELEASED").map((row) => `${row.title}: ${row.status}`), ...blockingConstraints.map((row) => row.description)];
  const status: ReadinessStatus = completion ? "COMPLETE" : input.actualSiteStart || activity.actualStart ? "STARTED" : releaseStatus === "PARTIALLY RELEASED" ? "PARTIALLY RELEASED" : requirements.some((row) => row.rag === "RED") ? "NOT READY" : "READY";
  const rag: ReadinessRag = status === "COMPLETE" || status === "READY" ? "GREEN" : status === "PARTIALLY RELEASED" || status === "STARTED" ? "AMBER" : "RED";
  return { activityId: activity.programmeActivityId, status, rag, releaseStatus, requirements, blockers, actualRelease, siteCompletedAt: completion?.completed_at, actualSiteStart: input.actualSiteStart || activity.actualStart };
}

export function requiresReadinessException(readiness: ActivityReadiness) { return readiness.status === "NOT READY" || readiness.status === "PARTIALLY RELEASED"; }
