import assert from "node:assert/strict";
import test from "node:test";
import { activitiesForVersion, locationValue, measuredWorkValidation, resourcesForActivity, UNSPECIFIED_LOCATION } from "./programmeSelection.ts";
import type { ProgrammeActivity, ProgrammeImportData } from "../types/site.ts";

const activity = { id: "1", programmeActivityId: "A1", activity: "Panels", building: "", elevation: "North", level: "01", unit: "m²", plannedQuantity: 10, plannedManDayProductivity: 2, assumedGangSize: 4, sourceImportId: "v2", createdAt: "now" } satisfies ProgrammeActivity;

test("blank imported hierarchy remains selectable", () => assert.equal(locationValue(activity.building), UNSPECIFIED_LOCATION));
test("programme version filtering keeps latest and missing activities", () => {
  const missing = { ...activity, id: "2", programmeActivityId: "A2", sourceImportId: "v1", missingFromLatestUpdate: true };
  assert.deepEqual(activitiesForVersion([activity, missing], { snapshots: [], relationships: [], resources: [], assignments: [] }, "v2").map((item) => item.programmeActivityId), ["A1", "A2"]);
});
test("incomplete activities are visible but identify missing baseline fields", () => {
  assert.match(measuredWorkValidation({ ...activity, unit: "", plannedManDayProductivity: undefined, assumedGangSize: undefined }) ?? "", /unit of measure.*planned man-day productivity.*assumed gang size/);
  assert.equal(measuredWorkValidation(activity), null);
});
test("activity assignments resolve imported resource names", () => {
  const data: ProgrammeImportData = { snapshots: [], relationships: [], resources: [{ id: "r", projectId: "p", resourceId: "R1", resourceName: "Facade gang", sourceImportId: "v2" }], assignments: [{ id: "a", projectId: "p", programmeActivityId: "A1", resourceId: "R1", sourceImportId: "v2" }] };
  assert.deepEqual(resourcesForActivity(activity, data), ["Facade gang"]);
});
