-- Live operational readiness. Imported programme intent remains immutable here.
create table public.activity_releases (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  release_type text not null check (release_type in ('Client Handover','Main Contractor Handover','Area Release','Access Release','Predecessor Completion','Design Release','Inspection / Approval','Other')),
  title text not null, building text, elevation text, level text, area_zone text, description text,
  planned_release_date date, actual_release_date date, released_by_name text, responsible_organisation text,
  reference text, status text not null default 'NOT RELEASED' check (status in ('NOT RELEASED','PARTIALLY RELEASED','RELEASED','REVOKED')),
  notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.activity_release_links (
  release_id uuid not null references public.activity_releases(id) on delete cascade, project_id uuid not null,
  programme_activity_external_id text not null, primary key(release_id,programme_activity_external_id)
);
create table public.operational_readiness_dependencies (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  predecessor_external_activity_id text not null, successor_external_activity_id text not null,
  description text, active boolean not null default true, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id,predecessor_external_activity_id,successor_external_activity_id)
);
create table public.activity_site_completions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, programme_activity_external_id text not null,
  completed_at timestamptz not null, completed_by uuid references auth.users(id), quantity numeric, notes text,
  created_at timestamptz not null default now(), unique(project_id,programme_activity_external_id)
);
create table public.readiness_exceptions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, programme_activity_external_id text not null,
  issue_type text not null, issue_reference text, occurred_at timestamptz not null default now(), user_id uuid references auth.users(id),
  reason text not null check (length(trim(reason))>0), area_zone text, known_constraints jsonb not null default '[]'::jsonb,
  timeline_event_id uuid references public.timeline_events(id), created_at timestamptz not null default now()
);
create table public.readiness_evidence (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, release_id uuid references public.activity_releases(id) on delete cascade,
  programme_activity_external_id text not null, storage_path text not null, file_name text not null, file_type text, file_size bigint,
  uploaded_by uuid references auth.users(id), uploaded_at timestamptz not null default now()
);
create table public.readiness_audit (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, event_type text not null, entity_type text not null,
  entity_id text not null, old_value jsonb, new_value jsonb, reason text, changed_by uuid references auth.users(id), changed_at timestamptz not null default now()
);
create index activity_releases_project_idx on public.activity_releases(project_id,status,planned_release_date);
create index activity_release_links_activity_idx on public.activity_release_links(project_id,programme_activity_external_id);
create index readiness_exceptions_activity_idx on public.readiness_exceptions(project_id,programme_activity_external_id,occurred_at);

alter table public.activity_releases enable row level security;
alter table public.activity_release_links enable row level security;
alter table public.operational_readiness_dependencies enable row level security;
alter table public.activity_site_completions enable row level security;
alter table public.readiness_exceptions enable row level security;
alter table public.readiness_evidence enable row level security;
alter table public.readiness_audit enable row level security;

do $$ declare table_name text; begin
  foreach table_name in array array['activity_releases','activity_release_links','operational_readiness_dependencies','activity_site_completions','readiness_exceptions','readiness_evidence','readiness_audit'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.sitepulse_has_project_role(project_id,array[''planner'',''admin'',''commercial'',''site_team'']::public.sitepulse_project_role[]))',table_name||'_read',table_name);
  end loop;
end $$;
create policy activity_releases_write on public.activity_releases for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy activity_release_links_write on public.activity_release_links for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy activity_site_completions_write on public.activity_site_completions for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy readiness_exceptions_write on public.readiness_exceptions for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy readiness_evidence_write on public.readiness_evidence for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy readiness_audit_insert on public.readiness_audit for insert to authenticated with check (public.sitepulse_has_project_role(project_id,array['planner','admin','site_team']::public.sitepulse_project_role[]));
create policy operational_dependencies_write on public.operational_readiness_dependencies for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));

-- Reuse the existing private SitePulse evidence bucket; broaden MIME support for handover documents.
update storage.buckets set file_size_limit=20971520, allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id='timeline-photos';

create or replace function public.sitepulse_readiness_audit_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.readiness_audit(project_id,event_type,entity_type,entity_id,old_value,new_value,changed_by)
  values(coalesce(new.project_id,old.project_id),tg_op,tg_table_name,coalesce(new.id,old.id)::text,to_jsonb(old),to_jsonb(new),auth.uid());
  return coalesce(new,old);
end $$;
create trigger activity_release_audit after insert or update or delete on public.activity_releases for each row execute function public.sitepulse_readiness_audit_trigger();
create trigger operational_dependency_audit after insert or update or delete on public.operational_readiness_dependencies for each row execute function public.sitepulse_readiness_audit_trigger();
create trigger site_completion_audit after insert or update or delete on public.activity_site_completions for each row execute function public.sitepulse_readiness_audit_trigger();
create trigger readiness_exception_audit after insert or update or delete on public.readiness_exceptions for each row execute function public.sitepulse_readiness_audit_trigger();
