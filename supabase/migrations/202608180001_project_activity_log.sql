create table public.sitepulse_activity_log (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null, actor_email text, actor_name text,
  action text not null check (action in ('VIEW','INSERT','UPDATE','DELETE')),
  page_path text, entity_type text, entity_id text, old_value jsonb, new_value jsonb,
  occurred_at timestamptz not null default now()
);
create index sitepulse_activity_log_project_time_idx on public.sitepulse_activity_log(project_id,occurred_at desc);
create index sitepulse_activity_log_project_actor_idx on public.sitepulse_activity_log(project_id,actor_id,occurred_at desc);
create index sitepulse_activity_log_project_action_idx on public.sitepulse_activity_log(project_id,action,occurred_at desc);
alter table public.sitepulse_activity_log enable row level security;
create policy activity_log_admin_read on public.sitepulse_activity_log for select to authenticated using (public.sitepulse_has_project_role(project_id,array['admin']::public.sitepulse_project_role[]));
create policy activity_log_own_page_view on public.sitepulse_activity_log for insert to authenticated with check (action='VIEW' and actor_id=auth.uid() and public.sitepulse_has_project_role(project_id,array['planner','admin','commercial','site_team']::public.sitepulse_project_role[]));

create or replace function public.sitepulse_capture_change() returns trigger language plpgsql security definer set search_path=public as $$
declare before_row jsonb:=case when tg_op='INSERT' then null else to_jsonb(old) end; after_row jsonb:=case when tg_op='DELETE' then null else to_jsonb(new) end; row_data jsonb:=coalesce(after_row,before_row); target_project uuid; target_id text; claims jsonb:=coalesce(auth.jwt(),'{}'::jsonb);
begin
  target_project:=nullif(row_data->>'project_id','')::uuid; if target_project is null then return coalesce(new,old); end if;
  target_id:=coalesce(row_data->>'id',row_data->>'record_key',row_data->>'external_activity_id',row_data->>'programme_activity_external_id',row_data->>'timeline_event_id',md5(row_data::text));
  insert into public.sitepulse_activity_log(project_id,actor_id,actor_email,actor_name,action,entity_type,entity_id,old_value,new_value)
  values(target_project,auth.uid(),claims->>'email',coalesce(claims#>>'{user_metadata,full_name}',claims#>>'{user_metadata,name}'),tg_op,tg_table_name,target_id,before_row,after_row);
  return coalesce(new,old);
end $$;

do $$ declare target record; begin
  for target in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema='public' and c.column_name='project_id' and t.table_type='BASE TABLE' and c.table_name not in ('sitepulse_activity_log','readiness_audit','constraint_history') loop
    execute format('drop trigger if exists sitepulse_activity_audit on public.%I',target.table_name);
    execute format('create trigger sitepulse_activity_audit after insert or update or delete on public.%I for each row execute function public.sitepulse_capture_change()',target.table_name);
  end loop;
end $$;
comment on table public.sitepulse_activity_log is 'Admin-only project audit trail. Retention and privacy policy must be set by the operator.';
