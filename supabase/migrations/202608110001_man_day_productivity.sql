alter table public.programme_activities
  add column if not exists planned_man_day_productivity numeric,
  add column if not exists assumed_gang_size numeric,
  add column if not exists planned_gang_daily_output numeric,
  add column if not exists planned_man_days numeric,
  add column if not exists planned_duration_days numeric;

comment on column public.programme_activities.planned_man_day_productivity is 'Planned quantity per contributing operative per working day; never derived from an hourly rate without explicit day-hours.';
comment on column public.programme_activities.assumed_gang_size is 'Explicit assumed number of operatives used for the man-day baseline.';
