create table public.daily_plan_allocations (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, plan_date date not null,
 gang_id text not null, gang_name text not null, programme_activity_external_id text not null,
 building text not null default '', elevation text not null default '', level text not null default '', product_type text, area_zone text,
 planned_operatives integer not null check(planned_operatives>0), target_quantity numeric not null check(target_quantity>0), unit text not null,
 planned_man_day_productivity numeric, expected_gang_output numeric, target_productivity_factor numeric, target_rag text not null,
 readiness_status text not null, readiness_rag text not null, readiness_snapshot jsonb not null default '{}'::jsonb,
 warning_reason text, warning_narrative text, required_recovery_output numeric, notes text,
 plan_status text not null default 'DRAFT' check(plan_status in ('DRAFT','COMMITTED','REVISED','CLOSED')),
 revision_number integer not null default 0, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 last_revised_by uuid references auth.users(id), last_revised_at timestamptz
);
create table public.daily_plan_revisions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, plan_date date not null, revision_number integer not null,
 status text not null check(status in ('COMMITTED','REVISED','CLOSED')), snapshot jsonb not null, reason text,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(project_id,plan_date,revision_number)
);
create index daily_plan_project_date_idx on public.daily_plan_allocations(project_id,plan_date);
alter table public.daily_plan_allocations enable row level security; alter table public.daily_plan_revisions enable row level security;
create policy daily_plan_read on public.daily_plan_allocations for select to authenticated using(public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy daily_plan_write on public.daily_plan_allocations for all to authenticated using(public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])) with check(public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy daily_plan_revisions_read on public.daily_plan_revisions for select to authenticated using(public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy daily_plan_revisions_insert on public.daily_plan_revisions for insert to authenticated with check(public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
