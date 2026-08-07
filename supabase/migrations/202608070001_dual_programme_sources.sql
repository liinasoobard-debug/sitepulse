alter table public.programme_activities
  add column if not exists product_type text,
  add column if not exists programme_status text,
  add column if not exists budget_labour_hours numeric,
  add column if not exists source_type text;

create index if not exists programme_activities_product_type_idx
  on public.programme_activities(project_id, product_type);
