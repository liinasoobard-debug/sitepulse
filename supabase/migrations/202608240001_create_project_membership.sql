-- Allow an authenticated user to establish a new project and become its first
-- member. Existing projects cannot be claimed through this function.
create or replace function public.sitepulse_create_project(target_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1 from public.sitepulse_project_members
    where project_id = target_project
  ) then
    raise exception 'Project already exists';
  end if;

  insert into public.sitepulse_project_members (project_id, user_id, role)
  values (target_project, auth.uid(), 'admin');
end;
$$;

revoke all on function public.sitepulse_create_project(uuid) from public;
grant execute on function public.sitepulse_create_project(uuid) to authenticated;

comment on function public.sitepulse_create_project(uuid)
is 'Creates the first membership for a new client-generated project UUID; refuses existing projects.';
