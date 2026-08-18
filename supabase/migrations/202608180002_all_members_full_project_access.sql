-- Every authenticated project member has full access inside that project.
-- Authentication and explicit project membership still isolate project data.
create or replace function public.sitepulse_has_project_role(target_project uuid, allowed public.sitepulse_project_role[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.sitepulse_project_members member where member.project_id=target_project and member.user_id=auth.uid());
$$;
comment on function public.sitepulse_has_project_role(uuid,public.sitepulse_project_role[]) is 'Checks explicit project membership. All members have full in-project access; the legacy role argument remains for policy compatibility.';
drop policy if exists activity_log_admin_read on public.sitepulse_activity_log;
create policy activity_log_member_read on public.sitepulse_activity_log for select to authenticated using(public.sitepulse_has_project_role(project_id,array['admin']::public.sitepulse_project_role[]));
