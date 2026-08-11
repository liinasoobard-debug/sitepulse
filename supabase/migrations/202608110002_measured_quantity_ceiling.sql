alter table public.timeline_events
  add column if not exists change_category text;

create or replace function public.enforce_measured_quantity_ceiling()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  planned numeric;
  installed numeric;
begin
  if new.deleted_at is not null or new.event_type <> 'work' or new.status <> 'completed' then return new; end if;

  select pa.planned_quantity into planned
  from public.programme_activities pa
  where pa.project_id = new.project_id
    and (pa.id = new.programme_activity_id or pa.external_activity_id = new.external_activity_id)
  order by (pa.id = new.programme_activity_id) desc
  limit 1;

  if coalesce(planned, 0) <= 0 then return new; end if;

  select coalesce(sum(greatest(coalesce(te.actual_quantity, 0), 0)), 0) into installed
  from public.timeline_events te
  where te.project_id = new.project_id
    and te.external_activity_id = new.external_activity_id
    and te.event_type = 'work'
    and te.status = 'completed'
    and te.deleted_at is null
    and te.id <> new.id;

  if installed >= planned then
    raise exception 'This programme activity is 100%% complete. Record further work as Variation / Additional Work.';
  end if;
  if installed + greatest(coalesce(new.actual_quantity, 0), 0) > planned then
    raise exception 'Measured quantity exceeds the remaining planned quantity of %.', planned - installed;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_measured_quantity_ceiling on public.timeline_events;
create trigger enforce_measured_quantity_ceiling
before insert or update of actual_quantity, status, event_type, programme_activity_id, external_activity_id, deleted_at
on public.timeline_events
for each row execute function public.enforce_measured_quantity_ceiling();
