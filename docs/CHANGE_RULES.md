# SitePulse Development Guardrails

- Preserve existing working behaviour by default.
- Make only explicitly requested changes.
- Do not redesign unrelated pages.
- Do not refactor unrelated working code.
- Do not change calculations unless explicitly requested.
- Do not change authentication or RLS unless explicitly requested.
- Do not change programme import behaviour unless explicitly requested.
- Do not replace real Supabase persistence with local/demo state.
- Do not change shared components without identifying affected screens.
- Prefer the smallest safe change.
- Never remove working functionality merely because a new feature does not use it.
- Run regression checks after changes.
- Report every file modified.
- If a requested change requires a substantial architectural change, stop and explain before implementing it.

## Branch and release workflow

- `main` is the latest stable, approved SitePulse application.
- `develop` is the next integrated version under testing.
- `feature/<short-name>` contains one approved feature or change.
- `fix/<short-name>` contains one approved bug fix.
- Do not make feature changes directly on `main`.
- Start each change from the stable baseline, implement only the requested scope, build and test it, review it, merge it into `develop`, run regression checks, and merge an approved release into `main`.
