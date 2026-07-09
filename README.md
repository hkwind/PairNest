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
2. Copy `.env.example` to `.env` and set both `DATABASE_URL` and `DIRECT_URL`.
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
3. Add both `DATABASE_URL` and `DIRECT_URL` in Vercel Project Settings -> Environment Variables.
4. Use the default build command:

```bash
npm run build
```

5. Run migrations against production from your machine or CI:

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
- `DIRECT_URL` for direct Prisma migrations and schema work.

That setup is a good fit for Neon and Vercel because app traffic uses the pooler while migrations keep a direct path.

## Calendar Integration Strategy

The app no longer uses Apps Script or Google Sheets. Calendar connection metadata and cached events live in Postgres. The current implementation preserves the visible connection controls and app-event sync statuses, but does not impersonate the old Apps Script `CalendarApp` behavior. The production path is to add Google OAuth in Next.js, store provider tokens securely, and run provider sync through route handlers or scheduled Vercel Cron jobs that populate `CalendarCache` and update `Event` sync statuses.

## Tradeoffs

- Calendar provider sync is represented as metadata/cache architecture, not a fake Google sync.
- Authentication is intentionally minimal because the original app used a shared `coupleId`; adding auth can be layered around `Workspace` membership later.
- The UI keeps the original calm PairNest palette and sections while improving desktop/tablet layouts with a side rail and wider grids.
