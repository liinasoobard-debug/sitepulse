-- Restore strict project-role authorization after the temporary access mode.
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

drop policy if exists programme_imports_write on public.programme_imports;
drop policy if exists programme_imports_insert on public.programme_imports;
drop policy if exists programme_imports_update on public.programme_imports;
drop policy if exists programme_imports_delete on public.programme_imports;

create policy programme_imports_insert
on public.programme_imports for insert
to authenticated
with check (
  imported_by = auth.uid()
  and public.sitepulse_has_project_role(
    project_id,
    array['planner','admin']::public.sitepulse_project_role[]
  )
);

create policy programme_imports_update
on public.programme_imports for update
to authenticated
using (
  public.sitepulse_has_project_role(
    project_id,
    array['planner','admin']::public.sitepulse_project_role[]
  )
)
with check (
  public.sitepulse_has_project_role(
    project_id,
    array['planner','admin']::public.sitepulse_project_role[]
  )
);

create policy programme_imports_delete
on public.programme_imports for delete
to authenticated
using (
  public.sitepulse_has_project_role(
    project_id,
    array['admin']::public.sitepulse_project_role[]
  )
);
