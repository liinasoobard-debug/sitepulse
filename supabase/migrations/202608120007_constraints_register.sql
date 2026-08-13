-- Upgrade the central constraints model to an operational, auditable register.
alter table public.constraints
  add column if not exists constraint_reference text,
  add column if not exists project_wide boolean not null default false,
  add column if not exists calculated_rag text,
  add column if not exists override_rag text,
  add column if not exists rag_override_reason text,
  add column if not exists rag_overridden_by uuid references auth.users(id),
  add column if not exists rag_overridden_at timestamptz,
  add column if not exists notes text;

update public.constraints
set constraint_reference = 'CON-' || upper(substr(replace(id::text,'-',''),1,8)),
    calculated_rag = coalesce(calculated_rag,rag)
where constraint_reference is null or calculated_rag is null;

alter table public.constraints alter column constraint_reference set not null;
alter table public.constraints alter column constraint_reference
  set default ('CON-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
create unique index if not exists constraints_project_reference_idx
  on public.constraints(project_id,constraint_reference);

alter table public.constraint_activity_links
  add column if not exists blocking_relationship text not null default 'Blocking Progress';
alter table public.constraint_history
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb;
do $$ begin
  alter table public.constraint_activity_links add constraint constraint_link_relationship_check
    check (blocking_relationship in ('Blocking Start','Blocking Progress','Blocking Completion','Potential Risk','General Constraint'));
exception when duplicate_object then null; end $$;

insert into public.constraint_activity_links(constraint_id,project_id,programme_activity_external_id)
select id,project_id,programme_activity_external_id from public.constraints
where programme_activity_external_id is not null
on conflict do nothing;

-- Relational links may only point to a constraint and published programme
-- activity belonging to the same project. This backs up the client-side import
-- validation and prevents cross-project links even for users in both projects.
create or replace function public.sitepulse_validate_constraint_activity_link()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.constraints c
    where c.id = new.constraint_id and c.project_id = new.project_id
  ) then
    raise exception 'Constraint does not belong to the selected project';
  end if;
  if not exists (
    select 1
    from public.programme_activities a
    join public.programme_imports i on i.id = a.programme_import_id
    where a.project_id = new.project_id
      and a.external_activity_id = new.programme_activity_external_id
      and i.status = 'published'
  ) then
    raise exception 'Programme Activity ID is not published in the selected project';
  end if;
  return new;
end;
$$;

drop trigger if exists constraint_activity_link_scope on public.constraint_activity_links;
create trigger constraint_activity_link_scope
before insert or update on public.constraint_activity_links
for each row execute function public.sitepulse_validate_constraint_activity_link();
