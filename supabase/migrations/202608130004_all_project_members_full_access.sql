-- Current SitePulse rollout: every authenticated member has full access inside
-- projects they explicitly belong to. Project membership remains mandatory;
-- this does not grant access to other projects or unauthenticated users.
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
  );
$$;

comment on function public.sitepulse_has_project_role(uuid, public.sitepulse_project_role[])
is 'Checks explicit project membership. During the current rollout all project members have full in-project feature access; the allowed-role argument is retained for policy compatibility.';
