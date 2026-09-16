-- Site Test Access V1: restore real project-role enforcement, let a project
-- admin see every member of their project, protect a project from ever being
-- left with zero admins, and add a secure admin-only way to add an existing
-- SitePulse user by email. Does not touch 202609150001_enable_rls_missing_tables.sql
-- or rewrite any unrelated policy.

-- 1. Restore genuine role enforcement: membership in target_project AND the
-- member's role must be one of the allowed roles. (Was previously loosened to
-- membership-only in 202608130004/202608180002.)
create or replace function public.sitepulse_has_project_role(
  target_project uuid,
  allowed public.sitepulse_project_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sitepulse_project_members m
    where m.project_id = target_project
      and m.user_id = auth.uid()
      and m.role = any(allowed)
  );
$$;

comment on function public.sitepulse_has_project_role(uuid, public.sitepulse_project_role[])
is 'Checks that the current authenticated user is a member of target_project with one of the allowed roles.';

-- 2. Admins can read every membership row for their own project. Ordinary
-- members keep the pre-existing self-only read (members_read_self, untouched).
-- Both policies are evaluated with OR, so a user can read a row if either
-- applies. sitepulse_has_project_role runs as a security-definer function
-- owned by a role that bypasses RLS, so this does not recurse.
drop policy if exists members_admin_read on public.sitepulse_project_members;
create policy members_admin_read
on public.sitepulse_project_members for select
to authenticated
using (
  public.sitepulse_has_project_role(project_id, array['admin']::public.sitepulse_project_role[])
);

-- 3. A project must always keep at least one admin: block removing the last
-- admin's membership, and block changing the last admin's role away from admin.
create or replace function public.sitepulse_prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins integer;
begin
  if TG_OP = 'DELETE' then
    if old.role = 'admin' then
      select count(*) into remaining_admins
      from public.sitepulse_project_members
      where project_id = old.project_id and role = 'admin' and user_id <> old.user_id;
      if remaining_admins = 0 then
        raise exception 'Cannot remove the last admin from this project';
      end if;
    end if;
    return old;
  end if;

  if TG_OP = 'UPDATE' then
    if old.role = 'admin' and new.role <> 'admin' then
      select count(*) into remaining_admins
      from public.sitepulse_project_members
      where project_id = old.project_id and role = 'admin' and user_id <> old.user_id;
      if remaining_admins = 0 then
        raise exception 'Cannot change the role of the last admin for this project';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists sitepulse_prevent_last_admin_removal on public.sitepulse_project_members;
create trigger sitepulse_prevent_last_admin_removal
before update or delete on public.sitepulse_project_members
for each row execute function public.sitepulse_prevent_last_admin_removal();

-- 4. Admin-only RPC: add an EXISTING SitePulse user (resolved by email,
-- server-side only) to target_project with a specific existing role.
-- auth.users is never selectable by the browser directly and no
-- service-role key is used anywhere.
create or replace function public.sitepulse_add_project_member(
  target_project uuid,
  target_email text,
  target_role public.sitepulse_project_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.sitepulse_has_project_role(target_project, array['admin']::public.sitepulse_project_role[]) then
    raise exception 'Only a project admin can add members';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No SitePulse account was found for that email address';
  end if;

  if exists (
    select 1 from public.sitepulse_project_members
    where project_id = target_project and user_id = target_user_id
  ) then
    raise exception 'That user already has access to this project. Use "Change role" instead.';
  end if;

  insert into public.sitepulse_project_members (project_id, user_id, role)
  values (target_project, target_user_id, target_role);
end;
$$;

revoke all on function public.sitepulse_add_project_member(uuid, text, public.sitepulse_project_role) from public;
grant execute on function public.sitepulse_add_project_member(uuid, text, public.sitepulse_project_role) to authenticated;

comment on function public.sitepulse_add_project_member(uuid, text, public.sitepulse_project_role)
is 'Admin-only: adds an existing SitePulse user (resolved by email server-side) as a project member with the given role.';

-- 5. Admin-only, email-joined member list for the Users & Access UI. Returns
-- zero rows unless the caller is currently an admin of target_project - never
-- exposes auth.users or any membership row to a non-admin caller.
create or replace function public.sitepulse_list_project_members(target_project uuid)
returns table (
  project_id uuid,
  user_id uuid,
  email text,
  role public.sitepulse_project_role,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.project_id, m.user_id, u.email, m.role, m.created_at
  from public.sitepulse_project_members m
  join auth.users u on u.id = m.user_id
  where m.project_id = target_project
    and public.sitepulse_has_project_role(target_project, array['admin']::public.sitepulse_project_role[])
  order by m.created_at asc;
$$;

revoke all on function public.sitepulse_list_project_members(uuid) from public;
grant execute on function public.sitepulse_list_project_members(uuid) to authenticated;

comment on function public.sitepulse_list_project_members(uuid)
is 'Admin-only: lists all members of target_project with their email, resolved server-side.';
