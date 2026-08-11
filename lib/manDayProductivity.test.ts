import assert from "node:assert/strict";
import test from "node:test";
import { actualManDayProductivity, calculateManDayBaseline, groupGangDayProductivity } from "./manDayProductivity.ts";
import type { TimelineEvent } from "../types/site.ts";

const work = (id: string, activity: string, gang: string, quantity: number, operatives: string[], duration = 480): TimelineEvent => ({ id, programmeActivityId: activity, crewId: gang, time: "08:00", duration, title: activity, type: "work", status: "completed", quantity, affectedOperativeIds: operatives });

test("30 square metres with 6 operatives is 5 square metres per man-day", () => assert.equal(actualManDayProductivity(30, 6), 5));
test("no linked operatives returns no man-day productivity", () => assert.equal(actualManDayProductivity(30, 0), null));
test("two gangs on one activity are calculated separately", () => {
  const rows = groupGangDayProductivity([
    { date: "2026-08-11", event: work("1", "A", "G1", 30, ["1", "2", "3", "4", "5", "6"]) },
    { date: "2026-08-11", event: work("2", "A", "G2", 16, ["7", "8", "9", "10"]) },
  ]);
  assert.deepEqual(rows.map((row) => [row.gangId, row.actualManDayProductivity]), [["G1", 5], ["G2", 4]]);
});
test("an operative on two activities contributes one man-day to each activity", () => {
  const rows = groupGangDayProductivity([{ date: "2026-08-11", event: work("1", "A", "G", 5, ["1"]) }, { date: "2026-08-11", event: work("2", "B", "G", 7, ["1"]) }]);
  assert.deepEqual(rows.map((row) => row.operatives), [1, 1]);
});
test("part-day work still counts each linked operative once while retaining hours", () => {
  const [row] = groupGangDayProductivity([{ date: "2026-08-11", event: work("1", "A", "G", 12, ["1", "2"], 240) }]);
  assert.equal(row.operatives, 2); assert.equal(row.actualManDayProductivity, 6); assert.equal(row.productiveHours, 8);
});
test("disruption and VO records are excluded from measured productivity", () => {
  const disruption = { ...work("2", "A", "G", 100, ["1"]), type: "disruption" as const };
  const variation = { ...work("3", "A", "G", 100, ["1"]), type: "variation" as const };
  assert.equal(groupGangDayProductivity([{ date: "2026-08-11", event: work("1", "A", "G", 5, ["1"]) }, { date: "2026-08-11", event: disruption }, { date: "2026-08-11", event: variation }])[0].quantity, 5);
});
test("baseline formulas do not assume working-day hours", () => {
  assert.deepEqual(calculateManDayBaseline({ plannedQuantity: 120, plannedManDayProductivity: 6, assumedGangSize: 5, plannedDurationDays: 10 }, 30, 5), {
    plannedGangDailyOutput: 30, plannedManDays: 20, requiredAverageGangSize: 2, remainingQuantity: 90, remainingManDays: 15, requiredRemainingGangSize: 3,
  });
  assert.equal(calculateManDayBaseline({ plannedQuantity: 120 }, 0).plannedManDays, null);
});
