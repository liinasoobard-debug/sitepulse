-- Temporary access mode: every authenticated user receives the same database
-- permissions as an admin. Replace this function before production rollout.
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
  select auth.uid() is not null;
$$;

comment on function public.sitepulse_has_project_role(uuid, public.sitepulse_project_role[])
is 'Temporary mode: all authenticated users satisfy every role check.';
