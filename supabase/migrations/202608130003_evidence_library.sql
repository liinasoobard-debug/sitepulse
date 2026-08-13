-- Searchable, private project evidence. Binary objects remain private and are
-- authorised independently from their metadata rows.
create table if not exists public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  programme_activity_id text,
  building text,
  elevation text,
  level text,
  area text,
  product_type text,
  gang_id text,
  record_type text not null,
  record_id text,
  category text not null check (category in ('Progress','Constraint','Access','Handover','Delivery','Material','Plant','Quality','Damage','Change / VO','Safety','Other')),
  description text,
  captured_at timestamptz,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references auth.users(id),
  original_filename text not null,
  generated_display_filename text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null check (file_size >= 0)
);

create index if not exists evidence_project_time_idx on public.evidence_records(project_id, captured_at desc, uploaded_at desc);
create index if not exists evidence_project_activity_idx on public.evidence_records(project_id, programme_activity_id);
create index if not exists evidence_project_record_idx on public.evidence_records(project_id, record_type, record_id);
create index if not exists evidence_project_location_idx on public.evidence_records(project_id, building, elevation, level);
create index if not exists evidence_project_category_idx on public.evidence_records(project_id, category);

alter table public.evidence_records enable row level security;
create policy evidence_records_read on public.evidence_records for select to authenticated
  using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy evidence_records_insert on public.evidence_records for insert to authenticated
  with check (uploaded_by=auth.uid() and public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy evidence_records_update on public.evidence_records for update to authenticated
  using (uploaded_by=auth.uid() or public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]))
  with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy evidence_records_delete on public.evidence_records for delete to authenticated
  using (uploaded_by=auth.uid() or public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('sitepulse-evidence','sitepulse-evidence',false,20971520,array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy sitepulse_evidence_objects_read on storage.objects for select to authenticated
  using (bucket_id='sitepulse-evidence' and public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy sitepulse_evidence_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id='sitepulse-evidence' and owner_id=auth.uid()::text and public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy sitepulse_evidence_objects_update on storage.objects for update to authenticated
  using (bucket_id='sitepulse-evidence' and (owner_id=auth.uid()::text or public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['planner','admin']::public.sitepulse_project_role[])));
create policy sitepulse_evidence_objects_delete on storage.objects for delete to authenticated
  using (bucket_id='sitepulse-evidence' and (owner_id=auth.uid()::text or public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['planner','admin']::public.sitepulse_project_role[])));
