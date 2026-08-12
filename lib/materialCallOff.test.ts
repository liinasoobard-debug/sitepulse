import assert from "node:assert/strict";
import test from "node:test";
import { calculateCallOff, materialStage, resolveLeadTime } from "./materialCallOff.ts";

test("uses required-on-site date or programme start and subtracts working days", () => {
  assert.equal(
    calculateCallOff(
      { plannedStart: "2026-05-18", projectLeadTime: 5, internalBuffer: 2 },
      "2026-05-01",
    ).calculatedDate,
    "2026-05-07",
  );
  assert.equal(
    calculateCallOff(
      {
        requiredOnSiteDate: "2026-05-20",
        plannedStart: "2026-05-18",
        projectLeadTime: 5,
      },
      "2026-05-01",
    ).calculatedDate,
    "2026-05-13",
  );
});

test("lead-time precedence is requirement, supplier/product, product type, project", () => {
  assert.deepEqual(
    resolveLeadTime({
      requirementLeadTime: 4,
      supplierProductLeadTime: 6,
      productTypeLeadTime: 8,
      projectLeadTime: 10,
    }),
    { days: 4, source: "Material requirement" },
  );
  assert.equal(
    resolveLeadTime({ supplierProductLeadTime: 6, productTypeLeadTime: 8 })
      .days,
    6,
  );
  assert.equal(
    resolveLeadTime({ productTypeLeadTime: 8, projectLeadTime: 10 }).days,
    8,
  );
  assert.equal(resolveLeadTime({ projectLeadTime: 10 }).days, 10);
  assert.equal(resolveLeadTime({}).days, null);
});

test("programme movement recalculates recommendation while preserving actual dates", () => {
  const earlier = calculateCallOff(
    {
      plannedStart: "2026-05-18",
      projectLeadTime: 5,
      actualCallOffDate: "2026-05-08",
    },
    "2026-05-01",
  );
  const later = calculateCallOff(
    {
      plannedStart: "2026-05-25",
      projectLeadTime: 5,
      actualCallOffDate: "2026-05-08",
    },
    "2026-05-01",
  );
  assert.notEqual(earlier.calculatedDate, later.calculatedDate);
  assert.equal(later.status, "CALLED OFF");
});

test("late confirmation is red, delivery is green, and override preserves calculation", () => {
  assert.equal(
    calculateCallOff(
      {
        requiredOnSiteDate: "2026-05-20",
        projectLeadTime: 5,
        confirmedDeliveryDate: "2026-05-21",
      },
      "2026-05-01",
    ).rag,
    "RED",
  );
  assert.equal(
    calculateCallOff(
      {
        requiredOnSiteDate: "2026-05-20",
        projectLeadTime: 5,
        actualDeliveryDate: "2026-05-18",
      },
      "2026-05-01",
    ).rag,
    "GREEN",
  );
  const result = calculateCallOff(
    {
      requiredOnSiteDate: "2026-05-20",
      projectLeadTime: 5,
      overrideDate: "2026-05-10",
    },
    "2026-05-01",
  );
  assert.equal(result.calculatedDate, "2026-05-13");
  assert.equal(result.recommendedDate, "2026-05-10");
});
test("order, call-off, confirmation and delivery remain distinct stages", () => {
  assert.equal(materialStage({}), "NOT ORDERED");
  assert.equal(materialStage({ orderDate: "2026-05-01" }), "NOT CALLED OFF");
  assert.equal(materialStage({ actualCallOffDate: "2026-05-02" }), "CALLED OFF");
  assert.equal(materialStage({ confirmedDeliveryDate: "2026-05-10" }), "DELIVERY CONFIRMED");
  assert.equal(materialStage({ actualDeliveryDate: "2026-05-09" }), "DELIVERED");
});
