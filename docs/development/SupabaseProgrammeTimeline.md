# Supabase programme and timeline setup

SitePulse stores published programme versions, timeline events, labour, and photo metadata in normalized Supabase tables. The workbook remains a manual Planner/Admin upload and is parsed by the Next.js server route.

## Apply the migration

Run `supabase link --project-ref <project-ref>` after authenticating the Supabase CLI, then run `supabase db push`. Alternatively, paste `supabase/migrations/202608040001_programme_timeline_normalized.sql` into the Supabase SQL editor and run it once.

The migration creates the private `timeline-photos` bucket, database indexes, RLS policies, and the atomic `publish_programme_import` function.

## Assign the first project administrator

The local SitePulse project ID must be a UUID. Find the signed-in user's UUID under Authentication → Users and insert membership through the SQL editor:

```sql
insert into public.sitepulse_project_members (project_id, user_id, role)
values ('<sitepulse-project-uuid>', '<auth-user-uuid>', 'admin');
```

Additional roles are `planner` and `site_team`. Programme import and publication are rejected by RLS/server checks unless the user is a Planner or Admin.

Verify an authorization failure with the user and project UUIDs returned by the import API diagnostic:

```sql
select project_id, user_id, role
from public.sitepulse_project_members
where project_id = '<selected-project-uuid>'::uuid
  and user_id = '<authenticated-user-uuid>'::uuid;
```

If this returns no row, the selected project has not been assigned to that authenticated user. A database administrator can create the explicit membership:

```sql
insert into public.sitepulse_project_members (project_id, user_id, role)
values ('<selected-project-uuid>'::uuid, '<authenticated-user-uuid>'::uuid, 'admin')
on conflict (project_id, user_id) do update set role = excluded.role;
```

Use `planner` instead of `admin` where appropriate. Never infer programme permissions from browser project storage: the composite membership key is the authorization source of truth.

## Legacy shared-state cleanup

No programme or timeline migration is performed. After the normalized tables are live, old `sitepulse-programme-project-*` and `sitepulse-programme-import-project-*` rows in `sitepulse_shared_state` may be deleted from the Supabase dashboard. SitePulse no longer reads or writes those keys. Local day records retain attendance and gangs only; saved timeline events are stripped before local persistence.

## Runtime flow

1. Planner/Admin uploads `.xlsx` on Programme.
2. `/api/programme/import` parses it server-side and inserts a normalized draft.
3. Planner/Admin publishes the draft; the database atomically supersedes the previous published import.
4. Programme dropdowns query only the current published import.
5. Timeline events write directly to `timeline_events` and photos upload to the private bucket.
