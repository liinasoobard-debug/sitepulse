create table if not exists public.sitepulse_shared_state (
  record_key text primary key,
  payload jsonb not null,
  client_id uuid not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.sitepulse_shared_state enable row level security;

create policy "Authenticated users can read shared SitePulse data"
on public.sitepulse_shared_state for select
to authenticated
using (true);

create policy "Authenticated users can create shared SitePulse data"
on public.sitepulse_shared_state for insert
to authenticated
with check (updated_by = auth.uid());

create policy "Authenticated users can update shared SitePulse data"
on public.sitepulse_shared_state for update
to authenticated
using (true)
with check (updated_by = auth.uid());

create policy "Authenticated users can delete shared SitePulse data"
on public.sitepulse_shared_state for delete
to authenticated
using (true);

create or replace function public.set_sitepulse_shared_state_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sitepulse_shared_state_audit_fields
on public.sitepulse_shared_state;

create trigger set_sitepulse_shared_state_audit_fields
before insert or update on public.sitepulse_shared_state
for each row execute function public.set_sitepulse_shared_state_audit_fields();

alter publication supabase_realtime add table public.sitepulse_shared_state;
