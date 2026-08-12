alter table public.material_requirements
  add column if not exists material_code text,
  add column if not exists package text,
  add column if not exists order_reference text,
  add column if not exists po_number text,
  add column if not exists order_date date,
  add column if not exists explicit_status text,
  add column if not exists notes text,
  add column if not exists site_notes text,
  add column if not exists material_issue boolean not null default false,
  add column if not exists import_source text,
  add column if not exists import_row_key text;

create unique index if not exists material_requirements_import_key_idx
  on public.material_requirements(project_id, import_source, import_row_key)
  where import_source is not null and import_row_key is not null;

create table if not exists public.material_import_mappings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, mapping_name text not null,
  source_headers jsonb not null default '[]'::jsonb, column_mapping jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, mapping_name)
);

create table if not exists public.constraints (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  programme_activity_external_id text, category text not null,
  description text not null, source text not null, source_record_id text, source_condition_key text not null,
  first_detected_date date not null, raised_date date, calculated_required_date date, overridden_required_date date,
  required_date_override_reason text, owner text, responsible_organisation text,
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED','OPEN','ACTIONED / MONITORING','CLOSED','DISMISSED')),
  rag text not null default 'GREY' check (rag in ('GREEN','AMBER','RED','GREY')),
  programme_forecast_impact text, action_required text, latest_update text, closed_date date,
  closed_by uuid references auth.users(id), evidence_notes text, occurrence_count integer not null default 1,
  last_detected_date date not null, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, programme_activity_external_id, category, source_condition_key)
);
create table if not exists public.constraint_activity_links (
  constraint_id uuid not null references public.constraints(id) on delete cascade,
  project_id uuid not null, programme_activity_external_id text not null,
  primary key(constraint_id, programme_activity_external_id)
);
create table if not exists public.constraint_history (
  id uuid primary key default gen_random_uuid(), constraint_id uuid not null references public.constraints(id) on delete cascade,
  project_id uuid not null, event_type text not null, from_status text, to_status text, from_rag text, to_rag text,
  note text, changed_by uuid references auth.users(id), changed_at timestamptz not null default now()
);
create index if not exists constraints_project_status_idx on public.constraints(project_id,status,rag);
create index if not exists constraint_history_project_date_idx on public.constraint_history(project_id,changed_at);

alter table public.material_import_mappings enable row level security;
alter table public.constraints enable row level security;
alter table public.constraint_activity_links enable row level security;
alter table public.constraint_history enable row level security;

create policy material_mapping_read on public.material_import_mappings for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
create policy material_mapping_write on public.material_import_mappings for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
create policy constraints_read on public.constraints for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy constraints_insert on public.constraints for insert to authenticated with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy constraints_update on public.constraints for update to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy constraint_links_access on public.constraint_activity_links for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy constraint_history_read on public.constraint_history for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy constraint_history_insert on public.constraint_history for insert to authenticated with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
