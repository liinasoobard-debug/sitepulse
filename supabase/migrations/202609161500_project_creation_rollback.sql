-- Project-creation rollback: if a project's shared-list metadata write fails
-- after sitepulse_create_project already inserted the creator's membership
-- row, the client needs a safe way to undo that membership so it doesn't
-- become an orphaned "Recovered Project" placeholder.
--
-- The existing sitepulse_prevent_last_admin_removal trigger (correctly)
-- blocks removing a project's last admin. Rolling back a just-created,
-- single-member project intentionally needs to remove that sole admin, so
-- this migration adds a narrow, transaction-local bypass that only the new
-- rollback RPC below can set, and only for that one delete.

create or replace function public.sitepulse_prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins integer;
begin
  if current_setting('sitepulse.bypass_last_admin_check', true) = 'on' then
    if TG_OP = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

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

-- Admin-only in effect (only the sole member of a project can ever satisfy
-- the "exactly one member, and it's me" check below), and only ever deletes
-- the caller's own membership row for a project they are the sole member of.
create or replace function public.sitepulse_rollback_project_creation(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into member_count
  from public.sitepulse_project_members
  where project_id = target_project;

  if member_count <> 1 then
    raise exception 'This project has other members and cannot be rolled back';
  end if;

  if not exists (
    select 1 from public.sitepulse_project_members
    where project_id = target_project and user_id = auth.uid()
  ) then
    raise exception 'Only the project''s own creator can roll it back';
  end if;

  perform set_config('sitepulse.bypass_last_admin_check', 'on', true);

  delete from public.sitepulse_project_members
  where project_id = target_project and user_id = auth.uid();
end;
$$;

revoke all on function public.sitepulse_rollback_project_creation(uuid) from public;
grant execute on function public.sitepulse_rollback_project_creation(uuid) to authenticated;

comment on function public.sitepulse_rollback_project_creation(uuid)
is 'Undoes sitepulse_create_project for its caller when a later step of project creation fails; refuses if the project has gained any other member.';
