-- Preserve P6 actuals when publishing and when daily records change.
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
  source_activity record;
  imported jsonb;
  resolved_status text;
begin
  if not public.sitepulse_has_project_role(target_project, array['planner','admin','site_team']::public.sitepulse_project_role[]) then
    raise exception 'Project membership required';
  end if;

  select pa.*, pi.source_type as import_source into source_activity
  from public.programme_activities pa
  join public.programme_imports pi on pi.id = pa.programme_import_id
  where pa.project_id = target_project
    and pa.external_activity_id = target_external_activity
  order by (pi.status = 'published') desc, pi.import_version desc
  limit 1;

  if not found then raise exception 'Programme activity not found'; end if;

  planned := source_activity.planned_quantity;

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

  -- Immutable source values are captured at import, before timeline recalculation.
  -- For older P6 imports, retain surviving values until the source is re-imported.
  imported := source_activity.raw_data -> 'importedActuals';
  if imported is null or jsonb_typeof(imported) <> 'object' then
    imported := case when source_activity.import_source in ('p6-xlsx', 'asta-xlsx') then
      jsonb_build_object(
        'actualStart', source_activity.actual_start,
        'actualFinish', source_activity.actual_finish,
        'percentComplete', source_activity.percent_complete,
        'status', source_activity.activity_status
      ) else '{}'::jsonb end;
  end if;

  started := coalesce((imported ->> 'actualStart')::date, started);
  finished := coalesce((imported ->> 'actualFinish')::date, finished);
  completion := greatest(coalesce((imported ->> 'percentComplete')::numeric, 0), completion);
  resolved_status := case
    when finished is not null or lower(coalesce(imported ->> 'status', '')) in ('completed', 'tk_complete')
      or completion >= 100 then 'Completed'
    when started is not null or completion > 0
      or lower(coalesce(imported ->> 'status', '')) in ('in progress', 'active', 'tk_active') then 'In Progress'
    else 'Not Started' end;
  if resolved_status = 'Completed' then completion := 100; end if;

  -- Recalculate the selected version only; archived imports remain unchanged.
  update public.programme_activities pa set
    actual_start = started,
    actual_finish = finished,
    percent_complete = completion,
    programme_status = resolved_status,
    activity_status = resolved_status,
    remaining_duration = case when completion >= 100 then 0 else pa.remaining_duration end,
    updated_at = now()
  where pa.id = source_activity.id;
  return query select started, finished, completion;
end;
$$;

revoke all on function public.recalculate_programme_activity_actuals(uuid, text) from public;
grant execute on function public.recalculate_programme_activity_actuals(uuid, text) to authenticated;

