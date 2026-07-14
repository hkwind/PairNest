# PairNest

PairNest is now structured as a Next.js App Router app with TypeScript, Prisma, and Postgres. The refactor preserves the original single-file product shape: dashboard, wishlist, future goals, calendar, settings, partner colors, anniversary settings, custom events, calendar connection metadata, and add/delete/update flows.

## Current Baseline Mapping

The inspected Apps Script version stored data in Google Sheets named `wishlist`, `bucket_list`, `custom_events`, `settings`, `calendar_links`, and `calendar_cache`. The new schema maps those to `WishlistItem`, `Goal`, `Event`, `Workspace` plus `Partner`, `CalendarConnection`, and `CalendarCache`.

The old `google.script.run` calls map to API routes:

- `bootstrapApp` -> `GET /api/bootstrap`
- `saveSettings` -> `PUT /api/settings`
- `addWishlistItem` / `removeWishlistItem` -> `POST` / `DELETE /api/wishlist`
- `addBucketItem` / `removeBucketItem` -> `POST` / `DELETE /api/goals`
- `addCustomEventItem` / `removeCustomEventItem` -> `POST` / `DELETE /api/events`
- `connectCurrentUserCalendar`, `disconnectCurrentUserCalendar`, `refreshMyCalendarConnection` -> `/api/calendar-links`

## Folder Structure

- `app/` - App Router pages, layout, global CSS, and API routes
- `components/` - PairNest UI and icon wrappers
- `lib/` - Prisma client, repository/data access, defaults, date helpers, client API helper
- `types/` - Shared TypeScript models
- `prisma/` - Prisma schema, migration SQL, and seed data

## Local Setup

1. Create a hosted Postgres database with Supabase, Neon, or Vercel Postgres.
2. Copy `.env.example` to `.env` and set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Install dependencies:

```bash
npm install
```

4. Run migrations and seed development data:

```bash
npm run prisma:migrate
npm run prisma:seed
```

5. Start the app:

```bash
npm run dev
```

## Vercel Deployment

1. Push this project to GitHub.
2. Import the repository in Vercel.
3. Add both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel Project Settings -> Environment Variables.
4. For Google Calendar, add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
5. Use the default build command:

```bash
npm run build
```

6. Run migrations against production from your machine or CI:

```bash
npm run prisma:deploy
```

## Migration Plan

1. Export each Google Sheet tab as CSV.
2. Transform rows into the Prisma model names listed above.
3. Create the workspace first using the old `coupleId` as `Workspace.slug`.
4. Insert partners from settings as roles `A` and `B`.
5. Insert wishlist, goals, events, calendar connections, and calendar cache using the old IDs where desired.
6. Verify `/api/bootstrap?coupleId=YOUR_COUPLE_ID` returns the same counts as the Sheets version.
7. Switch the Vercel deployment to the imported workspace slug.

## Prisma With Neon

This repo uses two connection strings:

- `DATABASE_URL` for the pooled runtime connection.
- `DATABASE_URL_UNPOOLED` for direct Prisma migrations and schema work.

That setup is a good fit for Neon and Vercel because app traffic uses the pooler while migrations keep a direct path.

## Calendar Integration Strategy

The app no longer uses Apps Script or Google Sheets. Google Calendar uses OAuth through Next.js route handlers:

- `GET /api/google/start` sends a partner through Google consent.
- `GET /api/google/callback` exchanges the code and stores the active calendar connection.
- `PUT /api/calendar-links` refreshes upcoming Google events into `CalendarCache`.

Create a Google OAuth web client and add this authorized redirect URI:

```text
https://YOUR_VERCEL_DOMAIN/api/google/callback
```

Then set these Vercel environment variables:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR_VERCEL_DOMAIN/api/google/callback
```

The current scope is `https://www.googleapis.com/auth/calendar.events.readonly`, which imports Google events into PairNest. Writing PairNest-created events back to Google can be layered on later by expanding the scope and adding an event writeback step.

## Codex Skills

Codex skills should live as folders under:

```text
C:\Users\longs\.codex\skills
```

A reusable skill should usually be a folder with a `SKILL.md` file, for example:

```text
C:\Users\longs\.codex\skills\figma-design-analysis\SKILL.md
```

Your `DESIGN-figma.md` file can be used as a design reference, but Codex will not automatically treat a loose Markdown file as an installed skill. Put future reusable instructions in a folder with `SKILL.md`; put project-specific design docs inside the repo when they should travel with the code.

## Tradeoffs

- Google Calendar import is implemented through OAuth and cache refresh, but PairNest-created event writeback is not enabled yet.
- Authentication is intentionally minimal because the original app used a shared `coupleId`; adding auth can be layered around `Workspace` membership later.
- The UI now follows the provided Figma-style design reference: black-and-white app chrome, pastel content blocks, pill controls, circular icon actions, and light hairline borders.
