-- Project authorization must always resolve against the authenticated user's
-- explicit membership. Kept as a separate migration for deployed environments.
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
is 'Checks the current authenticated user role for one SitePulse project.';
