-- Baseline for tables that exist in the live database but were created outside
-- tracked migrations (see 202609150001). Without this, a fresh database cannot
-- be built from the migrations folder.
--
-- `create table if not exists` makes this a no-op on the live database.
-- IMPORTANT: these definitions are the minimum the application uses. Replace
-- them with the real definitions from the live database:
--   supabase db dump --schema public -f live_schema.sql
-- and copy the four CREATE TABLE statements in here.

create table if not exists public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  work_date date not null,
  operative_id text not null,
  present boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists daily_attendance_project_date_idx
  on public.daily_attendance(project_id, work_date);

create table if not exists public.project_operatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gang_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.gang_template_members (
  id uuid primary key default gen_random_uuid(),
  gang_template_id uuid references public.gang_templates(id) on delete cascade,
  created_at timestamptz not null default now()
);
