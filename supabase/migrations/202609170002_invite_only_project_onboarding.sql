-- Invite-only project onboarding. Public signup must also be disabled manually
-- in Supabase Auth settings; privileged Auth invites remain available to the
-- server-only admin client.

alter table public.sitepulse_projects
  add constraint sitepulse_projects_id_organisation_key unique (id, organisation_id);

create table public.sitepulse_project_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.sitepulse_organisations(id),
  project_id uuid not null,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role public.sitepulse_project_role not null,
  token_hash bytea not null unique,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  constraint sitepulse_project_invites_project_fk
    foreign key (project_id, organisation_id)
    references public.sitepulse_projects(id, organisation_id),
  constraint sitepulse_project_invites_expiry_check check (expires_at > created_at),
  constraint sitepulse_project_invites_acceptance_check check (
    (accepted_at is null and accepted_by is null) or
    (accepted_at is not null and accepted_by is not null)
  )
);

create index sitepulse_project_invites_project_idx
  on public.sitepulse_project_invites(project_id, created_at desc);
create index sitepulse_project_invites_pending_email_idx
  on public.sitepulse_project_invites(lower(email), expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.sitepulse_project_invites enable row level security;
-- No direct table policies: invitation reads/writes are RPC-only.

create or replace function public.sitepulse_create_project_invite(
  target_project uuid,
  target_email text,
  target_role public.sitepulse_project_role,
  target_token_hash text,
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation uuid;
  invite_id uuid;
  normalised_email text := lower(trim(target_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.sitepulse_can_manage_project(target_project) then
    raise exception 'Only a Project Admin or Organisation Admin can invite team members';
  end if;
  if normalised_email = '' or position('@' in normalised_email) <= 1 then
    raise exception 'Enter a valid email address';
  end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '8 days' then
    raise exception 'Invitation expiry must be within the next 8 days';
  end if;
  if target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation token hash';
  end if;

  select project.organisation_id into target_organisation
  from public.sitepulse_projects project where project.id = target_project;
  if target_organisation is null then raise exception 'Project not found'; end if;

  update public.sitepulse_project_invites
  set revoked_at = now()
  where project_id = target_project
    and email = normalised_email
    and accepted_at is null
    and revoked_at is null;

  insert into public.sitepulse_project_invites (
    organisation_id, project_id, email, role, token_hash,
    invited_by, expires_at
  ) values (
    target_organisation, target_project, normalised_email, target_role,
    decode(target_token_hash, 'hex'), auth.uid(), target_expires_at
  ) returning id into invite_id;

  return invite_id;
end;
$$;

create or replace function public.sitepulse_list_project_invites(target_project uuid)
returns table (
  id uuid,
  email text,
  role public.sitepulse_project_role,
  invited_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select invite.id, invite.email, invite.role, invite.invited_by,
    invite.created_at, invite.expires_at, invite.accepted_at, invite.revoked_at,
    case
      when invite.accepted_at is not null then 'accepted'
      when invite.revoked_at is not null then 'revoked'
      when invite.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.sitepulse_project_invites invite
  where invite.project_id = target_project
    and public.sitepulse_can_manage_project(target_project)
  order by invite.created_at desc;
$$;

create or replace function public.sitepulse_revoke_project_invite(target_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_project uuid;
begin
  select invite.project_id into invite_project
  from public.sitepulse_project_invites invite where invite.id = target_invite;
  if invite_project is null then raise exception 'Invitation not found'; end if;
  if not public.sitepulse_can_manage_project(invite_project) then
    raise exception 'Only a Project Admin or Organisation Admin can revoke invitations';
  end if;

  update public.sitepulse_project_invites
  set revoked_at = now()
  where id = target_invite and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Only a pending invitation can be revoked'; end if;
end;
$$;

create or replace function public.sitepulse_accept_project_invite(target_token_hash text)
returns table (project_id uuid, project_name text, project_code text, project_location text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched public.sitepulse_project_invites%rowtype;
  authenticated_email text;
begin
  if auth.uid() is null then raise exception 'Sign in before accepting this invitation'; end if;
  if target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'This invitation link is invalid'; end if;
  authenticated_email := lower(coalesce(auth.jwt()->>'email', ''));

  select invite.* into matched
  from public.sitepulse_project_invites invite
  where invite.token_hash = decode(target_token_hash, 'hex')
  for update;

  if matched.id is null then raise exception 'This invitation link is invalid'; end if;
  if matched.revoked_at is not null then raise exception 'This invitation has been revoked'; end if;
  if matched.accepted_at is not null then raise exception 'This invitation has already been used'; end if;
  if matched.expires_at <= now() then raise exception 'This invitation has expired'; end if;
  if authenticated_email = '' or authenticated_email <> matched.email then
    raise exception 'Sign in with the email address that received this invitation';
  end if;
  if not exists (
    select 1 from public.sitepulse_projects project
    where project.id = matched.project_id
      and project.organisation_id = matched.organisation_id
      and project.archived_at is null
  ) then
    raise exception 'This project is no longer available';
  end if;

  insert into public.sitepulse_organisation_members (organisation_id, user_id, role, created_by)
  values (matched.organisation_id, auth.uid(), 'member'::public.sitepulse_organisation_role, matched.invited_by)
  on conflict (organisation_id, user_id) do nothing;

  insert into public.sitepulse_project_members (project_id, user_id, role)
  values (matched.project_id, auth.uid(), matched.role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  update public.sitepulse_project_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = matched.id;

  return query
  select project.id, project.name, project.code, project.location
  from public.sitepulse_projects project where project.id = matched.project_id;
end;
$$;

revoke all on function public.sitepulse_create_project_invite(uuid,text,public.sitepulse_project_role,text,timestamptz) from public;
revoke all on function public.sitepulse_list_project_invites(uuid) from public;
revoke all on function public.sitepulse_revoke_project_invite(uuid) from public;
revoke all on function public.sitepulse_accept_project_invite(text) from public;

grant execute on function public.sitepulse_create_project_invite(uuid,text,public.sitepulse_project_role,text,timestamptz) to authenticated;
grant execute on function public.sitepulse_list_project_invites(uuid) to authenticated;
grant execute on function public.sitepulse_revoke_project_invite(uuid) to authenticated;
grant execute on function public.sitepulse_accept_project_invite(text) to authenticated;
