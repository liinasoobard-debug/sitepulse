import assert from "node:assert/strict";
import test from "node:test";
import { matchProgrammeActivities } from "./programmeActivityMatcher.ts";
import { interpretNaturalLanguageUpdate } from "./naturalLanguageUpdate.ts";
import type { ProgrammeActivity } from "../types/site.ts";

function mockActivity(overrides: Partial<ProgrammeActivity> & Pick<ProgrammeActivity, "programmeActivityId">): ProgrammeActivity {
  return {
    id: overrides.programmeActivityId,
    building: "Tower A",
    elevation: "",
    level: "",
    activity: "",
    unit: "m2",
    plannedQuantity: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const stickworkNorthL10 = mockActivity({
  programmeActivityId: "A",
  activityName: "Stickwork",
  elevation: "North Elevation",
  level: "Level 10",
});

const glazingNorthL10 = mockActivity({
  programmeActivityId: "B",
  activityName: "Glazing",
  elevation: "North Elevation",
  level: "Level 10",
});

const panelsSouthL09 = mockActivity({
  programmeActivityId: "C",
  activityName: "Panels",
  elevation: "South Elevation",
  level: "Level 09",
});

const windowsEastL11 = mockActivity({
  programmeActivityId: "D",
  activityName: "Windows",
  elevation: "East Elevation",
  level: "Level 11",
});

const programme: ProgrammeActivity[] = [stickworkNorthL10, glazingNorthL10, panelsSouthL09, windowsEastL11];

function match(text: string) {
  return matchProgrammeActivities(text, interpretNaturalLanguageUpdate(text), programme);
}

test("a work-type mention breaks a location tie in favour of the matching activity", () => {
  const text = "Four operatives were waiting on North L10 while glazing was stopped.";
  const results = match(text);

  assert.equal(results[0]?.activity.programmeActivityId, "B");
  assert.ok(results.some((result) => result.activity.programmeActivityId === "A"));
  assert.equal(results[0]?.confidence, "high");
  assert.ok(results[0]?.reasons.some((reason) => reason.includes("glazing")));
});

test("a location-only mention shared by two activities is ambiguous, not high confidence", () => {
  const text = "Gang 1 stopped on North Elevation Level 10.";
  const results = match(text);

  const topIds = results.map((result) => result.activity.programmeActivityId);
  assert.ok(topIds.includes("A"));
  assert.ok(topIds.includes("B"));
  assert.notEqual(results[0]?.confidence, "high");
});

test("a distinct location and work type produces a clear top match", () => {
  const text = "Installed panels on South L09.";
  const results = match(text);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.activity.programmeActivityId, "C");
  assert.equal(results[0]?.confidence, "high");
});

test("an update with no location or work-type evidence returns no candidates", () => {
  const text = "Waiting for access.";
  const results = match(text);

  assert.deepEqual(results, []);
});

test("a clear location and work type on a single candidate is a clear top match", () => {
  const text = "Windows delayed on East Level 11.";
  const results = match(text);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.activity.programmeActivityId, "D");
  assert.equal(results[0]?.confidence, "high");
});

test("returns at most three candidates, ranked by score", () => {
  const results = match("Work on North Elevation Level 10.");
  assert.ok(results.length <= 3);
  for (let index = 1; index < results.length; index += 1) {
    assert.ok(results[index - 1].score >= results[index].score);
  }
});
