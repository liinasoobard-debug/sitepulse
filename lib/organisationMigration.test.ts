import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202609170001_organisation_admin_v1.sql", import.meta.url),
  "utf8"
);

test("organisation project creation is guarded and creates canonical project plus Project Admin membership", () => {
  assert.match(migration, /create or replace function public\.sitepulse_create_organisation_project/);
  assert.match(migration, /member\.role = 'organisation_admin'/);
  assert.match(migration, /insert into public\.sitepulse_projects/);
  assert.match(migration, /insert into public\.sitepulse_project_members[\s\S]+values \(target_project, auth\.uid\(\), 'admin'\)/);
});

test("legacy bare project creation is revoked from authenticated users", () => {
  assert.match(migration, /revoke all on function public\.sitepulse_create_project\(uuid\) from authenticated/);
});

test("organisation and Project Admin management use a shared server-side authorization check", () => {
  assert.match(migration, /create or replace function public\.sitepulse_can_manage_project/);
  assert.match(migration, /sitepulse_has_project_role\(target_project, array\['admin'\]/);
  assert.match(migration, /sitepulse_has_organisation_role\(project\.organisation_id, array\['organisation_admin'\]/);
  assert.match(migration, /if not public\.sitepulse_can_manage_project\(target_project\)/);
});

test("operational project-role helper is not widened by the organisation migration", () => {
  assert.doesNotMatch(migration, /create or replace function public\.sitepulse_has_project_role/);
});

test("existing project UUIDs are preserved during shared-state and membership backfill", () => {
  assert.match(migration, /\(value->>'id'\)::uuid/);
  assert.match(migration, /select distinct member\.project_id/);
  assert.match(migration, /on conflict \(id\) do nothing/);
});

test("organisation member backfill casts the role literal to its enum type", () => {
  assert.match(migration, /'member'::public\.sitepulse_organisation_role/);
});

test("project membership has canonical referential integrity after backfill", () => {
  assert.match(migration, /foreign key \(project_id\) references public\.sitepulse_projects\(id\) not valid/);
  assert.match(migration, /validate constraint sitepulse_project_members_project_fk/);
});

test("project membership mutations are RPC-only and public execution is revoked", () => {
  assert.match(migration, /drop policy if exists members_insert_admin/);
  assert.match(migration, /drop policy if exists members_update_admin/);
  assert.match(migration, /drop policy if exists members_delete_admin/);
  assert.match(migration, /revoke all on function public\.sitepulse_update_project_member_role/);
  assert.match(migration, /revoke all on function public\.sitepulse_remove_project_member/);
});

test("rollback removes canonical metadata only for the existing creator-guarded flow", () => {
  assert.match(migration, /create or replace function public\.sitepulse_rollback_project_creation/);
  assert.match(migration, /member_count <> 1/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /delete from public\.sitepulse_projects where id = target_project and created_by = auth\.uid\(\)/);
});
