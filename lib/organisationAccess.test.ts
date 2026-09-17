import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreateOrganisationProject,
  canManageProjectTeam,
  canReadProjectOperations,
  explicitlyAllocatedProjectIds,
} from "./organisationAccess.ts";

test("Organisation Admin can create a project and normal member cannot", () => {
  assert.equal(canCreateOrganisationProject("organisation_admin"), true);
  assert.equal(canCreateOrganisationProject("member"), false);
});

test("Organisation Admin can manage any organisation project team", () => {
  assert.equal(canManageProjectTeam("organisation_admin", null), true);
});

test("Project Admin can manage their own project team", () => {
  assert.equal(canManageProjectTeam("member", "admin"), true);
});

test("normal user cannot manage an unrelated project team", () => {
  assert.equal(canManageProjectTeam("member", null), false);
});

test("Organisation Admin without project membership cannot read project operations", () => {
  assert.equal(canReadProjectOperations(null), false);
});

test("all existing project roles retain operational access", () => {
  assert.equal(canReadProjectOperations("admin"), true);
  assert.equal(canReadProjectOperations("planner"), true);
  assert.equal(canReadProjectOperations("commercial"), true);
  assert.equal(canReadProjectOperations("site_team"), true);
});

test("project visibility contains only explicitly allocated project IDs and preserves UUIDs", () => {
  const projectIds = [
    "9ef5ef39-6fdc-401e-8f20-bfc9d3d954c8",
    "64353389-06f6-470d-a8e0-66934768490a",
  ];
  assert.deepEqual(
    explicitlyAllocatedProjectIds([
      { projectId: projectIds[0] },
      { projectId: projectIds[1] },
      { projectId: projectIds[0] },
    ]),
    projectIds
  );
});
