create extension if not exists pgcrypto;

create type public.sitepulse_project_role as enum ('planner', 'admin', 'site_team');
create type public.programme_import_status as enum ('draft', 'published', 'superseded', 'failed');

create table public.sitepulse_project_members (
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.sitepulse_project_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.programme_imports (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  import_version integer not null, source_filename text not null,
  source_type text not null default 'manual_excel', source_file_version text,
  data_date date, imported_by uuid not null references auth.users(id), imported_at timestamptz not null default now(),
  published_by uuid references auth.users(id), published_at timestamptz,
  status public.programme_import_status not null default 'draft',
  validation_summary jsonb not null default '{}'::jsonb, mapping_config jsonb not null default '{}'::jsonb,
  activity_count integer not null default 0, relationship_count integer not null default 0,
  resource_count integer not null default 0, assignment_count integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, import_version)
);
create unique index programme_imports_one_published on public.programme_imports(project_id) where status = 'published';

create table public.programme_activities (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  programme_import_id uuid not null references public.programme_imports(id) on delete cascade,
  external_activity_id text not null, activity_name text not null, activity_status text,
  wbs_code text, wbs_name text, building text, area text, level text, gridline text, location text, trade text,
  planned_start date, planned_finish date, actual_start date, actual_finish date,
  original_duration numeric, remaining_duration numeric, percent_complete numeric,
  planned_quantity numeric, unit text, productivity_target numeric, productivity_basis text,
  planned_crew_size numeric, calendar_name text, raw_data jsonb not null default '{}'::jsonb,
  is_missing_from_latest boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(programme_import_id, external_activity_id)
);

create table public.programme_relationships (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  programme_import_id uuid not null references public.programme_imports(id) on delete cascade,
  predecessor_external_activity_id text not null, successor_external_activity_id text not null,
  relationship_type text, lag numeric, raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.programme_resources (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  programme_import_id uuid not null references public.programme_imports(id) on delete cascade,
  external_resource_id text not null, resource_name text not null, resource_type text, unit text,
  raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(programme_import_id, external_resource_id)
);
create table public.programme_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  programme_import_id uuid not null references public.programme_imports(id) on delete cascade,
  activity_external_id text not null, resource_external_id text not null,
  budgeted_units numeric, actual_units numeric, remaining_units numeric,
  assignment_start date, assignment_finish date, raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, daily_record_id uuid,
  programme_activity_id uuid references public.programme_activities(id),
  programme_import_id uuid references public.programme_imports(id), external_activity_id text,
  event_type text not null, activity_name_snapshot text not null,
  building_snapshot text, area_snapshot text, level_snapshot text, location_snapshot text,
  unit_snapshot text, productivity_target_snapshot numeric,
  event_date date not null, start_time time not null, finish_time time,
  actual_quantity numeric, operative_count integer, labour_hours numeric, note text,
  crew_id text, status text, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.timeline_event_labour (
  id uuid primary key default gen_random_uuid(), timeline_event_id uuid not null references public.timeline_events(id) on delete cascade,
  operative_id text, gang_id text, hours numeric not null default 0, normal_hours numeric not null default 0,
  overtime_hours numeric not null default 0, created_at timestamptz not null default now()
);
create table public.timeline_event_photos (
  id uuid primary key default gen_random_uuid(), timeline_event_id uuid not null references public.timeline_events(id) on delete cascade,
  storage_path text not null, file_name text not null, file_type text, file_size bigint, category text,
  uploaded_by uuid not null references auth.users(id), uploaded_at timestamptz not null default now()
);

create index programme_imports_project_status_idx on public.programme_imports(project_id, status);
create index programme_activities_project_import_idx on public.programme_activities(project_id, programme_import_id);
create index programme_activities_external_idx on public.programme_activities(project_id, external_activity_id);
create index programme_activities_building_idx on public.programme_activities(project_id, building);
create index programme_activities_area_idx on public.programme_activities(project_id, area);
create index programme_activities_level_idx on public.programme_activities(project_id, level);
create index programme_activities_status_idx on public.programme_activities(project_id, activity_status);
create index timeline_events_project_date_idx on public.timeline_events(project_id, event_date) where deleted_at is null;
create index timeline_events_activity_idx on public.timeline_events(programme_activity_id) where deleted_at is null;

create or replace function public.sitepulse_has_project_role(target_project uuid, allowed public.sitepulse_project_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sitepulse_project_members m where m.project_id=target_project and m.user_id=auth.uid() and m.role=any(allowed));
$$;
create or replace function public.publish_programme_import(target_import uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_project uuid;
begin
  select project_id into target_project from public.programme_imports where id=target_import and status='draft' for update;
  if target_project is null then raise exception 'Draft programme import not found'; end if;
  if not public.sitepulse_has_project_role(target_project, array['planner','admin']::public.sitepulse_project_role[]) then raise exception 'Not authorized to publish programme'; end if;
  update public.programme_imports set status='superseded',updated_at=now() where project_id=target_project and status='published';
  update public.programme_imports set status='published',published_by=auth.uid(),published_at=now(),updated_at=now() where id=target_import;
end; $$;

alter table public.sitepulse_project_members enable row level security;
alter table public.programme_imports enable row level security;
alter table public.programme_activities enable row level security;
alter table public.programme_relationships enable row level security;
alter table public.programme_resources enable row level security;
alter table public.programme_assignments enable row level security;
alter table public.timeline_events enable row level security;
alter table public.timeline_event_labour enable row level security;
alter table public.timeline_event_photos enable row level security;

create policy members_read_self on public.sitepulse_project_members for select to authenticated using (user_id=auth.uid());
create policy members_insert_admin on public.sitepulse_project_members for insert to authenticated with check (public.sitepulse_has_project_role(project_id,array['admin']::public.sitepulse_project_role[]));
create policy members_update_admin on public.sitepulse_project_members for update to authenticated using (public.sitepulse_has_project_role(project_id,array['admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['admin']::public.sitepulse_project_role[]));
create policy members_delete_admin on public.sitepulse_project_members for delete to authenticated using (public.sitepulse_has_project_role(project_id,array['admin']::public.sitepulse_project_role[]));
create policy programme_imports_read on public.programme_imports for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]) or (status='published' and public.sitepulse_has_project_role(project_id,array['site_team']::public.sitepulse_project_role[])));
create policy programme_imports_write on public.programme_imports for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create policy programme_activities_read on public.programme_activities for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]) or (public.sitepulse_has_project_role(project_id,array['site_team']::public.sitepulse_project_role[]) and exists(select 1 from public.programme_imports i where i.id=programme_import_id and i.status='published')));
create policy programme_activities_write on public.programme_activities for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create policy programme_relationships_access on public.programme_relationships for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create policy programme_resources_read on public.programme_resources for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]) or (public.sitepulse_has_project_role(project_id,array['site_team']::public.sitepulse_project_role[]) and exists(select 1 from public.programme_imports i where i.id=programme_import_id and i.status='published')));
create policy programme_resources_write on public.programme_resources for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create policy programme_assignments_read on public.programme_assignments for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]) or (public.sitepulse_has_project_role(project_id,array['site_team']::public.sitepulse_project_role[]) and exists(select 1 from public.programme_imports i where i.id=programme_import_id and i.status='published')));
create policy programme_assignments_write on public.programme_assignments for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create policy timeline_events_read on public.timeline_events for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy timeline_events_insert on public.timeline_events for insert to authenticated with check (created_by=auth.uid() and public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy timeline_events_update on public.timeline_events for update to authenticated using (created_by=auth.uid() or public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create policy timeline_labour_access on public.timeline_event_labour for all to authenticated using (exists(select 1 from public.timeline_events e where e.id=timeline_event_id and public.sitepulse_has_project_role(e.project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]))) with check (exists(select 1 from public.timeline_events e where e.id=timeline_event_id and public.sitepulse_has_project_role(e.project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])));
create policy timeline_photos_access on public.timeline_event_photos for all to authenticated using (exists(select 1 from public.timeline_events e where e.id=timeline_event_id and public.sitepulse_has_project_role(e.project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]))) with check (uploaded_by=auth.uid() and exists(select 1 from public.timeline_events e where e.id=timeline_event_id and public.sitepulse_has_project_role(e.project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('timeline-photos','timeline-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic']) on conflict(id) do nothing;
create policy timeline_photo_objects_read on storage.objects for select to authenticated using (bucket_id='timeline-photos' and public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy timeline_photo_objects_insert on storage.objects for insert to authenticated with check (bucket_id='timeline-photos' and public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['planner','admin','site_team']::public.sitepulse_project_role[]));
