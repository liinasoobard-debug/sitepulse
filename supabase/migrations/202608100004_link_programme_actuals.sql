create or replace function public.recalculate_programme_activity_actuals(
  target_project uuid,
  target_external_activity text
)
returns table(actual_start date, actual_finish date, percent_complete numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  planned numeric;
  started date;
  finished date;
  installed numeric;
  completion numeric;
begin
  if not public.sitepulse_has_project_role(target_project, array['planner','admin','site_team']::public.sitepulse_project_role[]) then
    raise exception 'Project membership required';
  end if;

  select pa.planned_quantity into planned
  from public.programme_activities pa
  join public.programme_imports pi on pi.id = pa.programme_import_id
  where pa.project_id = target_project
    and pa.external_activity_id = target_external_activity
  order by (pi.status = 'published') desc, pi.import_version desc
  limit 1;

  if not found then raise exception 'Programme activity not found'; end if;

  select min(te.event_date), coalesce(sum(te.actual_quantity) filter (where te.status = 'completed'), 0)
  into started, installed
  from public.timeline_events te
  where te.project_id = target_project
    and te.external_activity_id = target_external_activity
    and te.event_type = 'work'
    and te.deleted_at is null;

  completion := case when coalesce(planned, 0) > 0
    then least(100, greatest(0, installed / planned * 100)) else 0 end;

  if completion >= 100 then
    select daily.event_date into finished
    from (
      select te.event_date,
        sum(sum(greatest(coalesce(te.actual_quantity, 0), 0))) over (order by te.event_date) as cumulative_quantity
      from public.timeline_events te
      where te.project_id = target_project
        and te.external_activity_id = target_external_activity
        and te.event_type = 'work'
        and te.status = 'completed'
        and te.deleted_at is null
      group by te.event_date
    ) daily
    where daily.cumulative_quantity >= planned
    order by daily.event_date
    limit 1;
  end if;

  update public.programme_activities pa set
    actual_start = started,
    actual_finish = finished,
    percent_complete = completion,
    programme_status = case when completion >= 100 then 'Completed' when started is not null then 'In Progress' else 'Not Started' end,
    activity_status = case when completion >= 100 then 'Completed' when started is not null then 'In Progress' else 'Not Started' end,
    remaining_duration = case when completion >= 100 then 0 else pa.remaining_duration end,
    updated_at = now()
  where pa.project_id = target_project
    and pa.external_activity_id = target_external_activity;

  return query select started, finished, completion;
end;
$$;

revoke all on function public.recalculate_programme_activity_actuals(uuid, text) from public;
grant execute on function public.recalculate_programme_activity_actuals(uuid, text) to authenticated;

create or replace function public.recalculate_published_programme_actuals(target_import uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  project uuid;
  activity record;
  refreshed integer := 0;
begin
  select pi.project_id into project
  from public.programme_imports pi
  where pi.id = target_import and pi.status = 'published';
  if not found then raise exception 'Published programme import not found'; end if;
  if not public.sitepulse_has_project_role(project, array['planner','admin']::public.sitepulse_project_role[]) then
    raise exception 'Planner or Admin access required';
  end if;

  for activity in
    select distinct pa.external_activity_id
    from public.programme_activities pa
    where pa.programme_import_id = target_import
  loop
    perform public.recalculate_programme_activity_actuals(project, activity.external_activity_id);
    refreshed := refreshed + 1;
  end loop;
  return refreshed;
end;
$$;

revoke all on function public.recalculate_published_programme_actuals(uuid) from public;
grant execute on function public.recalculate_published_programme_actuals(uuid) to authenticated;
