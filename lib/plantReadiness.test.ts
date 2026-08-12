import assert from "node:assert/strict";
import test from "node:test";
import {
  plantReadiness,
  plantRiskReason,
  plantStatus,
} from "./plantReadiness.ts";
test("booked upcoming plant is green and unconfirmed imminent plant is red", () => {
  assert.equal(
    plantReadiness(
      { requiredFromDate: "2026-05-12", explicitStatus: "BOOKED" },
      "2026-05-10",
    ).rag,
    "GREEN",
  );
  assert.equal(
    plantReadiness({ requiredFromDate: "2026-05-12" }, "2026-05-10").rag,
    "RED",
  );
});
test("on-hire, off-hire requested and actual off-hire remain distinct", () => {
  assert.equal(plantStatus({ onHireDate: "2026-05-01" }), "ON HIRE");
  assert.equal(
    plantStatus({
      onHireDate: "2026-05-01",
      offHireRequestedDate: "2026-05-10",
    }),
    "OFF-HIRE REQUESTED",
  );
  assert.equal(plantStatus({ actualOffHireDate: "2026-05-11" }), "OFF HIRED");
});
test("passed required-to or completed activity flags review only while on hire", () => {
  assert.equal(
    plantReadiness(
      { requiredToDate: "2026-05-09", onHireDate: "2026-05-01" },
      "2026-05-10",
    ).potentialOffHire,
    true,
  );
  assert.equal(
    plantReadiness(
      { activityComplete: true, onHireDate: "2026-05-01" },
      "2026-05-10",
    ).potentialOffHire,
    true,
  );
  assert.equal(
    plantReadiness(
      { activityComplete: true, actualOffHireDate: "2026-05-09" },
      "2026-05-10",
    ).potentialOffHire,
    false,
  );
});
test("true plant red produces constraint wording while off-hire does not", () => {
  const result = plantReadiness(
    { requiredFromDate: "2026-05-11" },
    "2026-05-10",
  );
  assert.match(
    plantRiskReason({
      description: "MEWP",
      activityName: "CW Glazing",
      result,
    })!,
    /Plant constraint detected/,
  );
  const offHire = plantReadiness(
    { requiredToDate: "2026-05-09", onHireDate: "2026-05-01" },
    "2026-05-10",
  );
  assert.equal(
    plantRiskReason({
      description: "MEWP",
      activityName: "CW Glazing",
      result: offHire,
    }),
    null,
  );
});
