-- All SitePulse roles assigned to a project can view that project's operational data.
-- This deliberately preserves project isolation: authenticated users without membership cannot read it.

alter table public.sitepulse_shared_state add column if not exists project_id uuid;

create or replace function public.set_sitepulse_shared_state_project_id()
returns trigger language plpgsql security invoker set search_path = public as $$
declare matched text[];
begin
  if new.record_key = 'sitepulse-projects' then new.project_id = null; return new; end if;
  matched := regexp_match(new.record_key, '^sitepulse-(?:operatives-project|day-project)-([0-9a-fA-F-]{36})(?:-|$)');
  if matched is null then raise exception 'Unsupported project shared-state key: %', new.record_key; end if;
  new.project_id = matched[1]::uuid;
  return new;
end;
$$;
drop trigger if exists set_sitepulse_shared_state_project_id on public.sitepulse_shared_state;
create trigger set_sitepulse_shared_state_project_id before insert or update of record_key on public.sitepulse_shared_state for each row execute function public.set_sitepulse_shared_state_project_id();
update public.sitepulse_shared_state set project_id=substring(record_key from '^sitepulse-(?:operatives-project|day-project)-([0-9a-fA-F-]{36})')::uuid where project_id is null and record_key ~ '^sitepulse-(?:operatives-project|day-project)-[0-9a-fA-F-]{36}';

drop policy if exists "Authenticated users can read shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Authenticated users can create shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Authenticated users can update shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Authenticated users can delete shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Members can read project shared data" on public.sitepulse_shared_state;
drop policy if exists "Members can create project shared data" on public.sitepulse_shared_state;
drop policy if exists "Members can update project shared data" on public.sitepulse_shared_state;
drop policy if exists "Project admins can delete project shared data" on public.sitepulse_shared_state;
create policy "Members can read project shared data" on public.sitepulse_shared_state for select to authenticated using (record_key='sitepulse-projects' or public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy "Members can create project shared data" on public.sitepulse_shared_state for insert to authenticated with check (updated_by=auth.uid() and (record_key='sitepulse-projects' or public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[])));
create policy "Members can update project shared data" on public.sitepulse_shared_state for update to authenticated using (record_key='sitepulse-projects' or public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[])) with check (updated_by=auth.uid() and (record_key='sitepulse-projects' or public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[])));
create policy "Project admins can delete project shared data" on public.sitepulse_shared_state for delete to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));
create index if not exists sitepulse_shared_state_project_idx on public.sitepulse_shared_state(project_id);

drop policy if exists programme_imports_read on public.programme_imports;
drop policy if exists programme_activities_read on public.programme_activities;
drop policy if exists programme_resources_read on public.programme_resources;
drop policy if exists programme_assignments_read on public.programme_assignments;
drop policy if exists programme_relationships_access on public.programme_relationships;
drop policy if exists programme_relationships_read on public.programme_relationships;
drop policy if exists programme_relationships_write on public.programme_relationships;
create policy programme_imports_read on public.programme_imports for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy programme_activities_read on public.programme_activities for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy programme_resources_read on public.programme_resources for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy programme_assignments_read on public.programme_assignments for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy programme_relationships_read on public.programme_relationships for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy programme_relationships_write on public.programme_relationships for all to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[])) with check (public.sitepulse_has_project_role(project_id,array['planner','admin']::public.sitepulse_project_role[]));

drop policy if exists timeline_events_read on public.timeline_events;
drop policy if exists timeline_labour_commercial_read on public.timeline_event_labour;
drop policy if exists timeline_photos_commercial_read on public.timeline_event_photos;
drop policy if exists timeline_photo_objects_commercial_read on storage.objects;
create policy timeline_events_read on public.timeline_events for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy timeline_labour_commercial_read on public.timeline_event_labour for select to authenticated using (exists(select 1 from public.timeline_events e where e.id=timeline_event_id and public.sitepulse_has_project_role(e.project_id,array['commercial']::public.sitepulse_project_role[])));
create policy timeline_photos_commercial_read on public.timeline_event_photos for select to authenticated using (exists(select 1 from public.timeline_events e where e.id=timeline_event_id and public.sitepulse_has_project_role(e.project_id,array['commercial']::public.sitepulse_project_role[])));
create policy timeline_photo_objects_commercial_read on storage.objects for select to authenticated using (bucket_id='timeline-photos' and public.sitepulse_has_project_role((storage.foldername(name))[1]::uuid,array['commercial']::public.sitepulse_project_role[]));

drop policy if exists material_mapping_read on public.material_import_mappings;
drop policy if exists plant_mapping_read on public.plant_import_mappings;
create policy material_mapping_read on public.material_import_mappings for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
create policy plant_mapping_read on public.plant_import_mappings for select to authenticated using (public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));
