-- Temporary pilot policy: every authenticated SitePulse user has admin-equivalent
-- access to every project. Replace this function when project invitations ship.
create or replace function public.sitepulse_has_project_role(
  target_project uuid,
  allowed public.sitepulse_project_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null;
$$;
