-- Organisation Admin V1. Additive canonical organisation/project ownership;
-- operational access remains exclusively project-membership based.

create type public.sitepulse_organisation_role as enum ('organisation_admin', 'member');

create table public.sitepulse_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.sitepulse_organisation_members (
  organisation_id uuid not null references public.sitepulse_organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.sitepulse_organisation_role not null default 'member',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (organisation_id, user_id)
);

create table public.sitepulse_projects (
  id uuid primary key,
  organisation_id uuid not null references public.sitepulse_organisations(id),
  name text not null,
  code text,
  location text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  archived_at timestamptz
);

-- Create one prototype organisation without guessing an auth user.
insert into public.sitepulse_organisations (name)
select 'SitePulse'
where not exists (select 1 from public.sitepulse_organisations);

-- Preserve UUIDs and metadata from the compatibility project list.
with prototype as (
  select id from public.sitepulse_organisations order by created_at, id limit 1
), legacy_projects as (
  select value
  from public.sitepulse_shared_state state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(state.payload) = 'array' then state.payload else '[]'::jsonb end
  ) value
  where state.record_key = 'sitepulse-projects'
    and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
insert into public.sitepulse_projects (id, organisation_id, name, code, location, created_at, archived_at)
select
  (value->>'id')::uuid,
  prototype.id,
  coalesce(nullif(trim(value->>'name'), ''), 'Recovered Project'),
  nullif(trim(value->>'code'), ''),
  nullif(trim(value->>'location'), ''),
  coalesce((value->>'createdAt')::timestamptz, now()),
  case when coalesce((value->>'isArchived')::boolean, false) then now() end
from legacy_projects cross join prototype
on conflict (id) do nothing;

-- Keep membership-only/recovered UUIDs for review rather than dropping them.
with prototype as (
  select id from public.sitepulse_organisations order by created_at, id limit 1
)
insert into public.sitepulse_projects (id, organisation_id, name, code)
select distinct member.project_id, prototype.id,
  'Recovered Project ' || left(member.project_id::text, 8),
  'REC-' || upper(left(member.project_id::text, 6))
from public.sitepulse_project_members member cross join prototype
on conflict (id) do nothing;

-- Existing project users become organisation members, not organisation admins.
insert into public.sitepulse_organisation_members (organisation_id, user_id, role, created_by)
select distinct project.organisation_id, member.user_id,
  'member'::public.sitepulse_organisation_role, member.user_id
from public.sitepulse_project_members member
join public.sitepulse_projects project on project.id = member.project_id
on conflict (organisation_id, user_id) do nothing;

alter table public.sitepulse_project_members
  add constraint sitepulse_project_members_project_fk
  foreign key (project_id) references public.sitepulse_projects(id) not valid;
alter table public.sitepulse_project_members
  validate constraint sitepulse_project_members_project_fk;

alter table public.sitepulse_organisations enable row level security;
alter table public.sitepulse_organisation_members enable row level security;
alter table public.sitepulse_projects enable row level security;

create or replace function public.sitepulse_has_organisation_role(
  target_organisation uuid,
  allowed public.sitepulse_organisation_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sitepulse_organisation_members member
    where member.organisation_id = target_organisation
      and member.user_id = auth.uid()
      and member.role = any(allowed)
  );
$$;

revoke all on function public.sitepulse_has_organisation_role(uuid, public.sitepulse_organisation_role[]) from public;
grant execute on function public.sitepulse_has_organisation_role(uuid, public.sitepulse_organisation_role[]) to authenticated;

create or replace function public.sitepulse_can_manage_project(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sitepulse_has_project_role(target_project, array['admin']::public.sitepulse_project_role[])
    or exists (
      select 1 from public.sitepulse_projects project
      where project.id = target_project
        and public.sitepulse_has_organisation_role(project.organisation_id, array['organisation_admin']::public.sitepulse_organisation_role[])
    );
$$;

revoke all on function public.sitepulse_can_manage_project(uuid) from public;
grant execute on function public.sitepulse_can_manage_project(uuid) to authenticated;

create policy organisations_member_read on public.sitepulse_organisations for select to authenticated
using (public.sitepulse_has_organisation_role(id, array['organisation_admin','member']::public.sitepulse_organisation_role[]));

create policy organisation_members_self_read on public.sitepulse_organisation_members for select to authenticated
using (user_id = auth.uid());
create policy organisation_members_admin_read on public.sitepulse_organisation_members for select to authenticated
using (public.sitepulse_has_organisation_role(organisation_id, array['organisation_admin']::public.sitepulse_organisation_role[]));

-- Organisation admins may administer project metadata; ordinary users only see
-- canonical metadata for projects to which they are explicitly allocated.
create policy projects_read on public.sitepulse_projects for select to authenticated
using (
  public.sitepulse_has_organisation_role(organisation_id, array['organisation_admin']::public.sitepulse_organisation_role[])
  or public.sitepulse_has_project_role(id, array['admin','planner','commercial','site_team']::public.sitepulse_project_role[])
);

-- Replace direct membership management with RPC-only mutation. Self/admin reads remain.
drop policy if exists members_insert_admin on public.sitepulse_project_members;
drop policy if exists members_update_admin on public.sitepulse_project_members;
drop policy if exists members_delete_admin on public.sitepulse_project_members;
drop policy if exists members_admin_read on public.sitepulse_project_members;
create policy members_manager_read on public.sitepulse_project_members for select to authenticated
using (user_id = auth.uid() or public.sitepulse_can_manage_project(project_id));

create or replace function public.sitepulse_current_organisation()
returns table (id uuid, name text, role public.sitepulse_organisation_role)
language sql
stable
security definer
set search_path = ''
as $$
  select organisation.id, organisation.name, member.role
  from public.sitepulse_organisation_members member
  join public.sitepulse_organisations organisation on organisation.id = member.organisation_id
  where member.user_id = auth.uid()
  order by organisation.created_at, organisation.id
  limit 1;
$$;

create or replace function public.sitepulse_list_organisation_projects()
returns table (id uuid, name text, code text, location text, archived_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select project.id, project.name, project.code, project.location, project.archived_at
  from public.sitepulse_projects project
  where public.sitepulse_has_organisation_role(project.organisation_id, array['organisation_admin']::public.sitepulse_organisation_role[])
  order by project.archived_at nulls first, project.name;
$$;

create or replace function public.sitepulse_create_organisation_project(
  target_project uuid,
  target_name text,
  target_code text default null,
  target_location text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation uuid;
begin
  select member.organisation_id into target_organisation
  from public.sitepulse_organisation_members member
  where member.user_id = auth.uid() and member.role = 'organisation_admin'
  order by member.created_at, member.organisation_id
  limit 1;

  if target_organisation is null then
    raise exception 'Only an Organisation Admin can create projects';
  end if;
  if nullif(trim(target_name), '') is null then
    raise exception 'Project name is required';
  end if;

  insert into public.sitepulse_projects (id, organisation_id, name, code, location, created_by)
  values (target_project, target_organisation, trim(target_name), nullif(trim(target_code), ''), nullif(trim(target_location), ''), auth.uid());

  insert into public.sitepulse_project_members (project_id, user_id, role)
  values (target_project, auth.uid(), 'admin');
end;
$$;

-- The old RPC creates a bare project membership with no organisation ownership.
revoke all on function public.sitepulse_create_project(uuid) from authenticated;

create or replace function public.sitepulse_add_project_member(
  target_project uuid,
  target_email text,
  target_role public.sitepulse_project_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_organisation uuid;
begin
  if not public.sitepulse_can_manage_project(target_project) then
    raise exception 'Only a Project Admin or Organisation Admin can add members';
  end if;

  select project.organisation_id into target_organisation
  from public.sitepulse_projects project where project.id = target_project;
  if target_organisation is null then raise exception 'Project not found'; end if;

  select id into target_user_id from auth.users
  where lower(email) = lower(trim(target_email)) limit 1;
  if target_user_id is null then raise exception 'No SitePulse account was found for that email address'; end if;

  insert into public.sitepulse_organisation_members (organisation_id, user_id, role, created_by)
  values (target_organisation, target_user_id, 'member', auth.uid())
  on conflict (organisation_id, user_id) do nothing;

  insert into public.sitepulse_project_members (project_id, user_id, role)
  values (target_project, target_user_id, target_role);
exception when unique_violation then
  raise exception 'That user already has access to this project. Use Change role instead.';
end;
$$;

create or replace function public.sitepulse_set_project_archived(
  target_project uuid,
  target_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sitepulse_projects project
  set archived_at = case when target_archived then coalesce(project.archived_at, now()) else null end
  where project.id = target_project
    and public.sitepulse_has_organisation_role(
      project.organisation_id,
      array['organisation_admin']::public.sitepulse_organisation_role[]
    );
  if not found then raise exception 'Only an Organisation Admin can archive this project'; end if;
end;
$$;

create or replace function public.sitepulse_update_project_member_role(
  target_project uuid,
  target_user uuid,
  target_role public.sitepulse_project_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sitepulse_can_manage_project(target_project) then
    raise exception 'Only a Project Admin or Organisation Admin can change project roles';
  end if;
  update public.sitepulse_project_members set role = target_role
  where project_id = target_project and user_id = target_user;
  if not found then raise exception 'Project member not found'; end if;
end;
$$;

create or replace function public.sitepulse_remove_project_member(
  target_project uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sitepulse_can_manage_project(target_project) then
    raise exception 'Only a Project Admin or Organisation Admin can remove project access';
  end if;
  if target_user = auth.uid() then raise exception 'You cannot remove your own project access here'; end if;
  delete from public.sitepulse_project_members
  where project_id = target_project and user_id = target_user;
  if not found then raise exception 'Project member not found'; end if;
end;
$$;

create or replace function public.sitepulse_list_project_members(target_project uuid)
returns table (project_id uuid, user_id uuid, email text, role public.sitepulse_project_role, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select member.project_id, member.user_id, account.email, member.role, member.created_at
  from public.sitepulse_project_members member
  join auth.users account on account.id = member.user_id
  where member.project_id = target_project
    and public.sitepulse_can_manage_project(target_project)
  order by member.created_at;
$$;

-- Rollback remains creator/sole-member only and now removes canonical metadata too.
create or replace function public.sitepulse_rollback_project_creation(target_project uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  select count(*) into member_count from public.sitepulse_project_members where project_id = target_project;
  if member_count <> 1 then raise exception 'This project has other members and cannot be rolled back'; end if;
  if not exists (select 1 from public.sitepulse_project_members where project_id = target_project and user_id = auth.uid()) then
    raise exception 'Only the project creator can roll it back';
  end if;
  perform set_config('sitepulse.bypass_last_admin_check', 'on', true);
  delete from public.sitepulse_project_members where project_id = target_project and user_id = auth.uid();
  delete from public.sitepulse_projects where id = target_project and created_by = auth.uid();
end;
$$;

revoke all on function public.sitepulse_current_organisation() from public;
revoke all on function public.sitepulse_list_organisation_projects() from public;
revoke all on function public.sitepulse_create_organisation_project(uuid,text,text,text) from public;
revoke all on function public.sitepulse_set_project_archived(uuid,boolean) from public;
revoke all on function public.sitepulse_add_project_member(uuid,text,public.sitepulse_project_role) from public;
revoke all on function public.sitepulse_update_project_member_role(uuid,uuid,public.sitepulse_project_role) from public;
revoke all on function public.sitepulse_remove_project_member(uuid,uuid) from public;
revoke all on function public.sitepulse_list_project_members(uuid) from public;
revoke all on function public.sitepulse_rollback_project_creation(uuid) from public;

grant execute on function public.sitepulse_current_organisation() to authenticated;
grant execute on function public.sitepulse_list_organisation_projects() to authenticated;
grant execute on function public.sitepulse_create_organisation_project(uuid,text,text,text) to authenticated;
grant execute on function public.sitepulse_set_project_archived(uuid,boolean) to authenticated;
grant execute on function public.sitepulse_add_project_member(uuid,text,public.sitepulse_project_role) to authenticated;
grant execute on function public.sitepulse_update_project_member_role(uuid,uuid,public.sitepulse_project_role) to authenticated;
grant execute on function public.sitepulse_remove_project_member(uuid,uuid) to authenticated;
grant execute on function public.sitepulse_list_project_members(uuid) to authenticated;
grant execute on function public.sitepulse_rollback_project_creation(uuid) to authenticated;
