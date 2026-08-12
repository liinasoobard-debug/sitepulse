-- Operational Plant lifecycle: requirements, hires, allocations, verified usage and off-hire.
-- Existing plant_hire_records remain valid and are classified as HIRE records.

alter table public.plant_hire_records
  alter column hire_reference drop not null,
  add column if not exists record_kind text not null default 'HIRE',
  add column if not exists asset_number text,
  add column if not exists arrival_date date,
  add column if not exists booking_required_by date,
  add column if not exists actual_booking_date date,
  add column if not exists confirmed_delivery_date date,
  add column if not exists off_hire_requested_by uuid references auth.users(id),
  add column if not exists requested_collection_date date,
  add column if not exists off_hire_reference text,
  add column if not exists off_hire_notes text,
  add column if not exists final_off_hire_notes text,
  add column if not exists collected_or_returned text;

do $$ begin
  alter table public.plant_hire_records add constraint plant_record_kind_check
    check (record_kind in ('HIRE','REQUIREMENT'));
exception when duplicate_object then null; end $$;

create table if not exists public.plant_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  plant_hire_record_id uuid not null references public.plant_hire_records(id) on delete cascade,
  gang_id text,
  gang_name text,
  programme_activity_external_id text,
  allocated_from date not null,
  allocated_to date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plant_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  plant_hire_record_id uuid not null references public.plant_hire_records(id) on delete cascade,
  timeline_event_id uuid not null references public.timeline_events(id) on delete cascade,
  usage_date date not null,
  gang_id text,
  gang_name text,
  programme_activity_external_id text,
  duration_hours numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(plant_hire_record_id, timeline_event_id)
);

create table if not exists public.plant_settings (
  project_id uuid primary key,
  idle_warning_working_days integer not null default 3 check (idle_warning_working_days >= 0),
  idle_red_working_days integer not null default 5 check (idle_red_working_days > idle_warning_working_days),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plant_allocations_current_idx
  on public.plant_allocations(project_id, plant_hire_record_id, allocated_from, allocated_to);
create index if not exists plant_usage_project_date_idx
  on public.plant_usage(project_id, usage_date desc);
create index if not exists plant_usage_hire_date_idx
  on public.plant_usage(plant_hire_record_id, usage_date desc);

alter table public.plant_allocations enable row level security;
alter table public.plant_usage enable row level security;
alter table public.plant_settings enable row level security;

drop policy if exists plant_allocations_access on public.plant_allocations;
drop policy if exists plant_usage_access on public.plant_usage;
drop policy if exists plant_settings_access on public.plant_settings;
create policy plant_allocations_access on public.plant_allocations for all to authenticated
  using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]))
  with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy plant_usage_access on public.plant_usage for all to authenticated
  using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]))
  with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy plant_settings_access on public.plant_settings for all to authenticated
  using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]))
  with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
