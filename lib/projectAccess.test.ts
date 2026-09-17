import assert from "node:assert/strict";
import test from "node:test";
import { isLastRemainingAdmin, projectMemberRoleLabel } from "./projectAccess.ts";

test("projectMemberRoleLabel maps every enum value to a friendly label", () => {
  assert.equal(projectMemberRoleLabel("admin"), "Project Admin");
  assert.equal(projectMemberRoleLabel("planner"), "Planner");
  assert.equal(projectMemberRoleLabel("commercial"), "Commercial");
  assert.equal(projectMemberRoleLabel("site_team"), "Site Team");
});

test("isLastRemainingAdmin is true only for the sole admin on a project", () => {
  const members = [
    { userId: "user-1", role: "admin" as const },
    { userId: "user-2", role: "site_team" as const },
  ];
  assert.equal(isLastRemainingAdmin(members, "user-1"), true);
  assert.equal(isLastRemainingAdmin(members, "user-2"), false);
});

test("isLastRemainingAdmin is false when more than one admin exists", () => {
  const members = [
    { userId: "user-1", role: "admin" as const },
    { userId: "user-2", role: "admin" as const },
  ];
  assert.equal(isLastRemainingAdmin(members, "user-1"), false);
  assert.equal(isLastRemainingAdmin(members, "user-2"), false);
});

test("isLastRemainingAdmin is false when there are no admins at all", () => {
  const members = [{ userId: "user-1", role: "site_team" as const }];
  assert.equal(isLastRemainingAdmin(members, "user-1"), false);
});
