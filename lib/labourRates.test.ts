import test from "node:test";
import assert from "node:assert/strict";
import { calculateLabourRateBreakdown, labourRateRuleForCompany, normaliseLabourRateSettings } from "./labourRates.ts";

test("splits a shift at the configured backshift start", () => {
  const result = calculateLabourRateBreakdown("15:00", "19:00", 20, { backshiftStart: "17:00", backshiftMultiplier: 1.5 });
  assert.deepEqual(result, { normalHours: 2, backshiftHours: 2, totalHours: 4, normalCost: 40, backshiftCost: 60, totalCost: 100 });
});

test("treats a shift starting after the threshold as backshift", () => {
  const result = calculateLabourRateBreakdown("18:00", "02:00", 20, { backshiftStart: "17:00", backshiftMultiplier: 1.5 });
  assert.equal(result.normalHours, 0);
  assert.equal(result.backshiftHours, 8);
  assert.equal(result.totalCost, 240);
});

test("uses a case-insensitive company override", () => {
  const settings = normaliseLabourRateSettings({ backshiftStart: "17:00", backshiftMultiplier: 1.5, companyRules: [{ company: "Alumet", backshiftStart: "18:00", backshiftMultiplier: 2 }] });
  assert.deepEqual(labourRateRuleForCompany(settings, "alumet"), { company: "Alumet", backshiftStart: "18:00", backshiftMultiplier: 2 });
});
