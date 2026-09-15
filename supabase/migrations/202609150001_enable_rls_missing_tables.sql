-- Security remediation: enable RLS on public tables discovered outside tracked
-- migrations (Supabase linter: rls_disabled_in_public). Adds a policy only where
-- the application currently reads data (daily_attendance, via the Site Labour
-- chart). Does not touch sitepulse_has_project_role or any existing policy.

alter table public.daily_attendance enable row level security;
alter table public.project_operatives enable row level security;
alter table public.gang_templates enable row level security;
alter table public.gang_template_members enable row level security;

drop policy if exists daily_attendance_read on public.daily_attendance;
create policy daily_attendance_read on public.daily_attendance for select to authenticated
  using (public.sitepulse_has_project_role(project_id, array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));

-- project_operatives, gang_templates and gang_template_members are not currently
-- read or written by the application. RLS is enabled with no policies (default-deny
-- for all non-service-role access) until real access requirements are defined.
-- gang_template_members' schema/project_id linkage could not be inspected from this
-- repo (it has no tracked migration), so no policy is invented for it here.
