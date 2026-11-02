-- Tamper-evident site records.
--
-- Diary entries, labour bookings, photos and evidence are used as
-- contemporaneous records in payment, delay and disruption disputes. They must
-- show who recorded what and when, and every later change. This migration:
--   1. adds an append-only history table written only by triggers;
--   2. forces server-side timestamps and authorship (clients cannot backdate);
--   3. stops hard deletion of evidence (soft delete only, history retained);
--   4. stores a SHA-256 fingerprint of each evidence file;
--   5. blocks deleting a stored evidence file once its record exists.

-- 1. Append-only history -------------------------------------------------------
create table if not exists public.sitepulse_record_history (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  table_name text not null,
  record_id uuid not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create index if not exists sitepulse_record_history_lookup_idx
  on public.sitepulse_record_history(project_id, table_name, record_id, changed_at);

alter table public.sitepulse_record_history enable row level security;

-- Read-only for the project team. No insert/update/delete policies exist, so
-- rows can only be written by the security-definer trigger below and can never
-- be edited or removed through the API.
drop policy if exists record_history_read on public.sitepulse_record_history;
create policy record_history_read on public.sitepulse_record_history for select to authenticated
  using (public.sitepulse_has_project_role(project_id, array['planner','admin','commercial']::public.sitepulse_project_role[]));

revoke insert, update, delete, truncate on public.sitepulse_record_history from anon, authenticated;

create or replace function public.sitepulse_write_record_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  target_project uuid;
begin
  target_project := nullif(row_data->>'project_id', '')::uuid;
  if target_project is null and row_data ? 'timeline_event_id' then
    select e.project_id into target_project
    from public.timeline_events e
    where e.id = (row_data->>'timeline_event_id')::uuid;
  end if;
  if target_project is null then
    return coalesce(new, old);
  end if;

  insert into public.sitepulse_record_history(project_id, table_name, record_id, operation, old_row, new_row)
  values (
    target_project,
    TG_TABLE_NAME,
    (row_data->>'id')::uuid,
    TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- 2. Server-side timestamps and authorship ------------------------------------
create or replace function public.sitepulse_protect_record_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
begin
  if TG_OP = 'INSERT' then
    if row_data ? 'created_at' then new := jsonb_populate_record(new, jsonb_build_object('created_at', now())); end if;
    if row_data ? 'updated_at' then new := jsonb_populate_record(new, jsonb_build_object('updated_at', now())); end if;
    if row_data ? 'uploaded_at' then new := jsonb_populate_record(new, jsonb_build_object('uploaded_at', now())); end if;
    return new;
  end if;

  -- UPDATE: identity, authorship and original timestamps are immutable.
  if new.id is distinct from old.id then raise exception 'Record id cannot be changed'; end if;
  if row_data ? 'project_id' and (row_data->>'project_id') is distinct from (to_jsonb(old)->>'project_id') then
    raise exception 'A record cannot be moved to another project';
  end if;
  new := jsonb_populate_record(new, jsonb_strip_nulls(jsonb_build_object(
    'created_at', to_jsonb(old)->'created_at',
    'created_by', to_jsonb(old)->'created_by',
    'uploaded_at', to_jsonb(old)->'uploaded_at',
    'uploaded_by', to_jsonb(old)->'uploaded_by',
    'storage_path', to_jsonb(old)->'storage_path',
    'sha256', to_jsonb(old)->'sha256'
  )));
  if row_data ? 'updated_at' then new := jsonb_populate_record(new, jsonb_build_object('updated_at', now())); end if;
  return new;
end;
$$;

-- 3. Evidence: soft delete + fingerprint ------------------------------------------
alter table public.evidence_records add column if not exists deleted_at timestamptz;
alter table public.evidence_records add column if not exists deleted_by uuid references auth.users(id);
alter table public.evidence_records add column if not exists sha256 text
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
alter table public.timeline_event_photos add column if not exists sha256 text
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

drop policy if exists evidence_records_delete on public.evidence_records;
-- No delete policy: evidence rows can no longer be hard-deleted through the API.
-- Withdraw a record by setting deleted_at (allowed by the existing update policy);
-- the history table keeps the original.

-- 4. Stored evidence files cannot be removed or overwritten once registered ---------
drop policy if exists sitepulse_evidence_objects_delete on storage.objects;
create policy sitepulse_evidence_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'sitepulse-evidence'
    and owner_id = auth.uid()::text
    and not exists (select 1 from public.evidence_records r where r.storage_path = name)
  );
drop policy if exists sitepulse_evidence_objects_update on storage.objects;

-- 5. Attach triggers ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['timeline_events','timeline_event_labour','timeline_event_photos','evidence_records'] loop
    execute format('drop trigger if exists sitepulse_protect_metadata on public.%I', t);
    execute format('create trigger sitepulse_protect_metadata before insert or update on public.%I for each row execute function public.sitepulse_protect_record_metadata()', t);
    execute format('drop trigger if exists sitepulse_record_history on public.%I', t);
    execute format('create trigger sitepulse_record_history after insert or update or delete on public.%I for each row execute function public.sitepulse_write_record_history()', t);
  end loop;
end;
$$;
