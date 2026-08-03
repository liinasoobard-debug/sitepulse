# Supabase shared-data setup

SitePulse uses Supabase Auth for pilot email/password access and Supabase Realtime for shared operational data. Browser storage is retained as a local cache so the existing UI stays fast and can continue displaying its last synced data if the connection drops.

## 1. Create the Supabase project

1. Create a Free Plan project in Supabase.
2. Save the database password in a password manager. SitePulse does not use or store it.
3. Wait for the project to finish provisioning.

## 2. Configure authentication

In **Authentication → Providers → Email**:

- Enable the Email provider.
- Enable email/password sign-in.
- For a closed pilot, do not expose public sign-up in SitePulse.
- Decide whether pilot users must confirm their email. Dashboard-created users can be marked confirmed by an administrator.

In **Authentication → URL Configuration**:

- Set **Site URL** to the deployed SitePulse URL, for example `https://sitepulse.example.com`.
- Add `http://localhost:3000` as a redirect URL for local development.
- Add the final Vercel deployment URL as a redirect URL.

SitePulse currently uses password sign-in and does not require an OAuth callback route.

## 3. Configure environment variables

Copy the Project URL and publishable key from the Supabase project API settings. Add these to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Replace the placeholders with real values and restart the development server. Add the same variable names and values to each Vercel environment that should run SitePulse, then redeploy.

The Project URL and publishable key are designed for browser use. Never add the database password, a service-role key, or other private server credentials to a `NEXT_PUBLIC_` variable. `.env.local` is ignored by Git.

## 4. Create the shared data table

1. Open **SQL Editor** in the Supabase dashboard.
2. Open [`supabase/migrations/202608030001_shared_sitepulse_state.sql`](../../supabase/migrations/202608030001_shared_sitepulse_state.sql) from this repository.
3. Copy the entire file into a new SQL query and select **Run**.
4. Confirm `sitepulse_shared_state` appears in **Table Editor** and that Realtime is enabled for it.

The migration enables Row Level Security. Only authenticated users can read or change SitePulse records. All pilot users currently share one workspace, so every authenticated user can see every project and operational record.

## 5. Create the first pilot user

1. Open **Authentication → Users** in the Supabase dashboard.
2. Select **Add user → Create new user**.
3. Enter the pilot user's email address and a strong temporary password.
4. Enable **Auto Confirm User** if the user should sign in immediately without an email-confirmation step.
5. Select **Create user**.
6. Give the credentials to the pilot user through a secure channel.
7. Open `/login` in SitePulse and sign in.

There is intentionally no public sign-up page. Additional pilot users must be created or invited by a Supabase project administrator.

## 6. Verify the connection

1. Visit `/login` while signed out.
2. Sign in with the pilot account.
3. Confirm the application opens, the user's email appears in the project header, and the status reads **Shared data synced**.
4. Add or change a record on one device and confirm a second signed-in device refreshes with the update.
5. Select **Log out** and confirm SitePulse returns to `/login`.
6. Try opening a protected URL such as `/reports` while signed out and confirm it redirects to `/login`.

On the first successful connection to an empty shared table, SitePulse uploads the existing records from that browser. Once rows exist, Supabase is authoritative and newly connected devices download the shared records.

## Security model

- Browser and server clients use only the publishable key.
- Supabase Auth sessions are stored in secure SSR-compatible cookies.
- `proxy.ts` refreshes and checks the session before protected routes render.
- Server Components and Server Actions use the cookie-aware server helper.
- Operational records are stored as project/day-level JSON rows, limiting unrelated overwrite conflicts.
- Local browser storage is a cache; Supabase is the shared source of truth after initial migration.
- All authenticated pilot users currently have access to all projects. Add organisation/project membership policies before using one Supabase project for separate client organisations.
