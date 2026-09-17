import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202609170002_invite_only_project_onboarding.sql", import.meta.url),
  "utf8"
);
const loginAction = readFileSync(new URL("../app/login/actions.ts", import.meta.url), "utf8");
const loginForm = readFileSync(new URL("../app/login/LoginForm.tsx", import.meta.url), "utf8");
const inviteRoute = readFileSync(new URL("../app/api/project-invites/route.ts", import.meta.url), "utf8");

test("public application signup is removed", () => {
  assert.doesNotMatch(loginAction, /auth\.signUp|function signup/);
  assert.doesNotMatch(loginForm, /Create account|signupAction/);
});

test("invite records use a unique hash and never store a raw token", () => {
  assert.match(migration, /token_hash bytea not null unique/);
  assert.doesNotMatch(migration, /raw_token\s+(text|varchar)/i);
});

test("only a Project Admin or Organisation Admin can create invitations", () => {
  assert.match(migration, /sitepulse_create_project_invite/);
  assert.match(migration, /if not public\.sitepulse_can_manage_project\(target_project\)/);
});

test("acceptance uses the server-side invitation project and role", () => {
  assert.match(migration, /values \(matched\.project_id, auth\.uid\(\), matched\.role\)/);
  assert.doesNotMatch(migration, /sitepulse_accept_project_invite\([^)]*target_project/);
  assert.doesNotMatch(migration, /sitepulse_accept_project_invite\([^)]*target_role/);
});

test("acceptance rejects revoked, used, expired and email-mismatched invitations", () => {
  assert.match(migration, /matched\.revoked_at is not null/);
  assert.match(migration, /matched\.accepted_at is not null/);
  assert.match(migration, /matched\.expires_at <= now\(\)/);
  assert.match(migration, /authenticated_email <> matched\.email/);
});

test("acceptance adds organisation and project memberships then marks the invite used", () => {
  assert.match(migration, /insert into public\.sitepulse_organisation_members/);
  assert.match(migration, /insert into public\.sitepulse_project_members/);
  assert.match(migration, /set accepted_at = now\(\), accepted_by = auth\.uid\(\)/);
});

test("invitation tables have no direct browser policies and RPC execution is explicitly granted", () => {
  assert.match(migration, /alter table public\.sitepulse_project_invites enable row level security/);
  assert.doesNotMatch(migration, /create policy .*sitepulse_project_invites/i);
  assert.match(migration, /grant execute on function public\.sitepulse_accept_project_invite\(text\) to authenticated/);
});

test("email delivery uses Supabase invite for new users and non-creating magic links for existing users", () => {
  assert.match(inviteRoute, /inviteUserByEmail/);
  assert.match(inviteRoute, /signInWithOtp/);
  assert.match(inviteRoute, /shouldCreateUser: false/);
  assert.match(inviteRoute, /sitepulse_can_manage_project/);
});
