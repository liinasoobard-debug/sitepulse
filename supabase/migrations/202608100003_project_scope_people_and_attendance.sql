alter table public.sitepulse_shared_state
  add column if not exists project_id uuid;

create or replace function public.set_sitepulse_shared_state_project_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare matched text[];
begin
  if new.record_key = 'sitepulse-projects' then
    new.project_id = null;
    return new;
  end if;
  matched := regexp_match(new.record_key, '^sitepulse-(?:operatives-project|day-project)-([0-9a-fA-F-]{36})(?:-|$)');
  if matched is null then
    raise exception 'Unsupported project shared-state key: %', new.record_key;
  end if;
  new.project_id = matched[1]::uuid;
  return new;
end;
$$;

drop trigger if exists set_sitepulse_shared_state_project_id on public.sitepulse_shared_state;
create trigger set_sitepulse_shared_state_project_id
before insert or update of record_key on public.sitepulse_shared_state
for each row execute function public.set_sitepulse_shared_state_project_id();

update public.sitepulse_shared_state
set project_id = substring(record_key from '^sitepulse-day-project-([0-9a-fA-F-]{36})-')::uuid
where record_key like 'sitepulse-day-project-%' and project_id is null;

drop policy if exists "Authenticated users can read shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Authenticated users can create shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Authenticated users can update shared SitePulse data" on public.sitepulse_shared_state;
drop policy if exists "Authenticated users can delete shared SitePulse data" on public.sitepulse_shared_state;

create policy "Members can read project shared data"
on public.sitepulse_shared_state for select to authenticated
using (
  record_key = 'sitepulse-projects'
  or public.sitepulse_has_project_role(project_id, array['planner','admin','site_team']::public.sitepulse_project_role[])
);

create policy "Members can create project shared data"
on public.sitepulse_shared_state for insert to authenticated
with check (
  updated_by = auth.uid() and (
    record_key = 'sitepulse-projects'
    or public.sitepulse_has_project_role(project_id, array['planner','admin','site_team']::public.sitepulse_project_role[])
  )
);

create policy "Members can update project shared data"
on public.sitepulse_shared_state for update to authenticated
using (
  record_key = 'sitepulse-projects'
  or public.sitepulse_has_project_role(project_id, array['planner','admin','site_team']::public.sitepulse_project_role[])
)
with check (
  updated_by = auth.uid() and (
    record_key = 'sitepulse-projects'
    or public.sitepulse_has_project_role(project_id, array['planner','admin','site_team']::public.sitepulse_project_role[])
  )
);

create policy "Project admins can delete project shared data"
on public.sitepulse_shared_state for delete to authenticated
using (
  public.sitepulse_has_project_role(project_id, array['planner','admin']::public.sitepulse_project_role[])
);

create index if not exists sitepulse_shared_state_project_idx
on public.sitepulse_shared_state(project_id);
