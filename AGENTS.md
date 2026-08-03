<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
# SitePulse AI Development Guide

## Mission
SitePulse is a construction production management platform.

## Principles
- The programme is the source of truth.
- Attendance, gangs, timeline, progress and reports all reference Programme Activities.
- Users navigate by:
  Project → Building → Elevation → Level → Activity
- Programme Activity IDs come from imported programmes and remain hidden in the UI.
- Preserve existing UI style and TypeScript standards.
- Avoid unnecessary dependencies.
- Prefer incremental, compile-ready changes.