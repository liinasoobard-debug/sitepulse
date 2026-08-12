create table public.material_call_off_settings (
  project_id uuid primary key,
  project_default_lead_time integer check (project_default_lead_time >= 0),
  internal_buffer integer not null default 0 check (internal_buffer >= 0),
  warning_period integer not null default 5 check (warning_period >= 0),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.material_product_type_defaults (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, product_type text not null,
  lead_time integer not null check (lead_time >= 0), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  unique(project_id, product_type)
);
create table public.material_supplier_products (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, supplier text not null, material text not null,
  lead_time integer not null check (lead_time >= 0), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  unique(project_id, supplier, material)
);
create table public.material_requirements (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  programme_activity_external_id text not null, material text not null, product_type text, supplier text,
  quantity numeric, unit text, required_on_site_date date, requirement_lead_time integer check (requirement_lead_time >= 0),
  calculated_call_off_date date, previous_calculated_call_off_date date, programme_date_changed boolean not null default false,
  overridden_call_off_date date, override_reason text, overridden_by uuid references auth.users(id), overridden_at timestamptz,
  actual_call_off_date date, confirmed_delivery_date date, actual_delivery_date date,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, programme_activity_external_id, material)
);
create index material_requirements_project_idx on public.material_requirements(project_id);
create index material_requirements_activity_idx on public.material_requirements(project_id, programme_activity_external_id);

alter table public.material_call_off_settings enable row level security;
alter table public.material_product_type_defaults enable row level security;
alter table public.material_supplier_products enable row level security;
alter table public.material_requirements enable row level security;

create policy material_settings_read on public.material_call_off_settings for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy material_settings_write on public.material_call_off_settings for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
create policy material_defaults_read on public.material_product_type_defaults for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy material_defaults_write on public.material_product_type_defaults for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
create policy material_supplier_read on public.material_supplier_products for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy material_supplier_write on public.material_supplier_products for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
create policy material_requirements_read on public.material_requirements for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy material_requirements_write on public.material_requirements for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial']::public.sitepulse_project_role[]));
