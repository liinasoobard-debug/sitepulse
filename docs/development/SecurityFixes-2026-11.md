# Security fixes – November 2026

## What changed

1. **Global project list closed off**
   - The shared record `sitepulse-projects` could be read and overwritten by any logged-in user in any organisation. It has been removed.
   - Projects now load only from `sitepulse_projects`, which is protected by row-level security.
   - Project settings (labour rates, productivity thresholds, hours per man-day) moved to a `settings` column on that table. They are saved through `sitepulse_update_project_settings`, which only admin, planner and commercial roles (or an organisation admin) can call.
   - Migration: `202611020001_retire_global_projects_record.sql`.

2. **Tamper-evident site records**
   - A new append-only table, `sitepulse_record_history`, logs every insert, update and delete on `timeline_events`, `timeline_event_labour`, `timeline_event_photos` and `evidence_records`. Nobody can edit or delete history through the API.
   - The server sets `created_at`, `updated_at` and `uploaded_at`, so clients can't backdate records. Authorship, storage path and file fingerprint can't be changed after creation.
   - Evidence can no longer be hard-deleted: set `deleted_at` instead. Once a file has a record, its stored copy can't be deleted or overwritten.
   - Each evidence upload saves a SHA-256 fingerprint of the file.
   - Migration: `202611020002_tamper_evident_site_records.sql`.

3. **Database can be rebuilt from migrations**
   - `202609140001_baseline_untracked_tables.sql` adds the four tables that were created outside migrations. **Replace its contents with the real definitions** from `supabase db dump --schema public`.

4. **Programme import hardened**
   - `xlsx` 0.18.5 from npm has known vulnerabilities (prototype pollution and ReDoS). It is replaced with SheetJS's official 0.20.3 release, which has the same API.
   - Uploads over 15 MB are rejected.
   - Error responses no longer return user IDs or membership details.

## Verified
- All migrations apply in order to a fresh PostgreSQL 16 database with Supabase stubs.
- SQL access tests: a user can see only their own organisation's projects; the legacy key is rejected; another project's settings can't be changed; backdating is overwritten; history can't be deleted; evidence can't be hard-deleted; users can't see other projects' diaries or history.
- All 172 unit tests pass. No new TypeScript errors.

## Not yet verified (do this locally)
- `npm install`, then `npm run build`, then log in and test project switching, saving settings and uploading evidence.
