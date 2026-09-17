import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isProjectMemberRole,
  normaliseInvitationEmail,
} from "./invitations.ts";

test("invitation tokens are random and only stable after hashing", () => {
  const first = createInvitationToken();
  const second = createInvitationToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashInvitationToken(first.token));
  assert.match(first.tokenHash, /^[0-9a-f]{64}$/);
});

test("invitations expire seven days after creation", () => {
  assert.equal(invitationExpiry(new Date("2026-09-17T12:00:00.000Z")), "2026-09-24T12:00:00.000Z");
});

test("only existing project roles are accepted", () => {
  assert.equal(isProjectMemberRole("admin"), true);
  assert.equal(isProjectMemberRole("planner"), true);
  assert.equal(isProjectMemberRole("commercial"), true);
  assert.equal(isProjectMemberRole("site_team"), true);
  assert.equal(isProjectMemberRole("organisation_admin"), false);
});

test("invitation email is normalized without revealing account existence", () => {
  assert.equal(normaliseInvitationEmail(" Person@Example.com "), "person@example.com");
  assert.equal(normaliseInvitationEmail("not-an-email"), null);
});
