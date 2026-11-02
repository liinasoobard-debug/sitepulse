-- Security fix: retire the global 'sitepulse-projects' shared-state record.
--
-- Previously every authenticated user (in any organisation) could read and
-- overwrite one shared JSON record containing every project's name, code,
-- location and settings. Project metadata now lives only in
-- public.sitepulse_projects (RLS-protected), and per-project settings move to a
-- settings column on that table, changed only through a checked RPC.

-- 1. Per-project settings on the canonical projects table.
alter table public.sitepulse_projects
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2. Backfill settings from the legacy shared record (if it still exists).
with legacy as (
  select value
  from public.sitepulse_shared_state state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(state.payload) = 'array' then state.payload else '[]'::jsonb end
  ) value
  where state.record_key = 'sitepulse-projects'
    and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
update public.sitepulse_projects project
set settings = jsonb_strip_nulls(jsonb_build_object(
  'labourRateSettings', legacy.value->'labourRateSettings',
  'productivityFactorThresholds', legacy.value->'productivityFactorThresholds',
  'hoursPerManDay', legacy.value->'hoursPerManDay'
))
from legacy
where project.id = (legacy.value->>'id')::uuid
  and project.settings = '{}'::jsonb;

-- 3. Settings can be changed by project admins/planners/commercial or an
-- organisation admin. Only known keys are accepted.
create or replace function public.sitepulse_update_project_settings(
  target_project uuid,
  target_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(target_settings) <> 'object' then
    raise exception 'Project settings must be a JSON object';
  end if;
  if not (
    public.sitepulse_has_project_role(target_project, array['admin','planner','commercial']::public.sitepulse_project_role[])
    or public.sitepulse_can_manage_project(target_project)
  ) then
    raise exception 'You do not have permission to change settings for this project';
  end if;
  update public.sitepulse_projects
  set settings = jsonb_strip_nulls(jsonb_build_object(
    'labourRateSettings', target_settings->'labourRateSettings',
    'productivityFactorThresholds', target_settings->'productivityFactorThresholds',
    'hoursPerManDay', target_settings->'hoursPerManDay'
  ))
  where id = target_project;
  if not found then raise exception 'Project not found'; end if;
end;
$$;

revoke all on function public.sitepulse_update_project_settings(uuid, jsonb) from public;
grant execute on function public.sitepulse_update_project_settings(uuid, jsonb) to authenticated;

-- 4. Shared-state policies: remove the global-record exception entirely.
drop policy if exists "Members can read project shared data" on public.sitepulse_shared_state;
drop policy if exists "Members can create project shared data" on public.sitepulse_shared_state;
drop policy if exists "Members can update project shared data" on public.sitepulse_shared_state;
drop policy if exists "Project admins can delete project shared data" on public.sitepulse_shared_state;

create policy "Members can read project shared data"
on public.sitepulse_shared_state for select to authenticated
using (project_id is not null and public.sitepulse_has_project_role(project_id, array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));

create policy "Members can create project shared data"
on public.sitepulse_shared_state for insert to authenticated
with check (updated_by = auth.uid() and project_id is not null
  and public.sitepulse_has_project_role(project_id, array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));

create policy "Members can update project shared data"
on public.sitepulse_shared_state for update to authenticated
using (project_id is not null and public.sitepulse_has_project_role(project_id, array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]))
with check (updated_by = auth.uid() and project_id is not null
  and public.sitepulse_has_project_role(project_id, array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));

create policy "Project admins can delete project shared data"
on public.sitepulse_shared_state for delete to authenticated
using (project_id is not null and public.sitepulse_has_project_role(project_id, array['planner','admin']::public.sitepulse_project_role[]));

-- 5. Reject the legacy key at the trigger, then remove the stored copy.
create or replace function public.set_sitepulse_shared_state_project_id()
returns trigger language plpgsql security invoker set search_path = public as $$
declare matched text[];
begin
  matched := regexp_match(new.record_key, '^sitepulse-(?:operatives-project|day-project)-([0-9a-fA-F-]{36})(?:-|$)');
  if matched is null then raise exception 'Unsupported project shared-state key: %', new.record_key; end if;
  new.project_id = matched[1]::uuid;
  return new;
end;
$$;

delete from public.sitepulse_shared_state where record_key = 'sitepulse-projects';
