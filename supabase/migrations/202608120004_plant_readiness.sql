create table public.plant_hire_records (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  plant_type text not null, description text, supplier text, hire_reference text not null, quantity numeric not null default 1,
  programme_activity_external_id text, building text, elevation text, level text,
  required_from_date date, required_to_date date, on_hire_date date, off_hire_requested_date date, actual_off_hire_date date,
  explicit_status text, active_issue boolean not null default false, notes text, site_notes text,
  daily_hire_cost numeric, weekly_hire_cost numeric, import_source text, import_row_key text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, hire_reference, plant_type)
);
create unique index plant_hire_import_key_idx on public.plant_hire_records(project_id,import_source,import_row_key) where import_source is not null and import_row_key is not null;
create table public.plant_import_mappings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, mapping_name text not null,
  source_headers jsonb not null default '[]'::jsonb, column_mapping jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,mapping_name)
);
create index plant_hire_project_dates_idx on public.plant_hire_records(project_id,required_from_date,required_to_date);
alter table public.plant_hire_records enable row level security;
alter table public.plant_import_mappings enable row level security;
create policy plant_read on public.plant_hire_records for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy plant_write on public.plant_hire_records for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy plant_mapping_read on public.plant_import_mappings for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
create policy plant_mapping_write on public.plant_import_mappings for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
