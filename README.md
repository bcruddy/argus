# Argus

Polymarket whale-trade detection. Argus polls Polymarket's public data API for large trades
($250k+ by default), stores them in Postgres, and serves a dashboard for browsing whale activity —
individual trades, wallet-grouped activity patterns, and a followed-wallets watchlist.

> **Honest status** (see `docs/audit-2026-08-07.md`): trade ingestion + the dashboard work today.
> Alert _delivery_ (Telegram/Discord) and the near-expiry/geopolitics detection rules are designed
> (schema + env vars exist) but **not yet implemented**.

## Stack

- Next.js (App Router) + React 19 + TypeScript
- PostgreSQL on [Neon](https://neon.com) (`@neondatabase/serverless`)
- [Clerk](https://clerk.com) authentication
- TanStack React Query, shadcn/ui, Tailwind, Zod
- `db-migrate` for migrations

## Getting started

Prerequisites: Node 22+, `pnpm` 10 (pinned via `packageManager`).

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local` — the app will not boot without:

- `DATABASE_URL` — a Neon Postgres connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — from [dashboard.clerk.com](https://dashboard.clerk.com)

Optional but recommended:

- `CLERK_WEBHOOK_SECRET` — for the user-sync webhook
- `CRON_SECRET` — required to call operator endpoints (`/api/backfill`); generate with `openssl rand -hex 32`

Then run migrations and start the dev server:

```bash
# db-migrate reads DATABASE_URL from the real environment, NOT .env.local
export DATABASE_URL='postgresql://...'
pnpm db:up

pnpm dev
```

Sign up at [http://localhost:3000](http://localhost:3000) (all app routes require auth), then click
**Refresh** on the dashboard to trigger an ingest — that's currently the only ingestion trigger.

## Commands

```bash
pnpm dev            # dev server
pnpm build          # production build
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm format         # prettier --write
pnpm format:check   # prettier --check (CI gate)
pnpm db:up          # run migrations (needs DATABASE_URL exported)
pnpm db:down        # roll back last migration
pnpm db:create      # create a new migration
```

## Layout

```
src/app/            pages + API route handlers
src/app/api/        trades, filters, ingest, backfill, wallets, webhooks
src/components/     app components + shadcn/ui primitives
src/hooks/          React Query hooks
src/lib/            db client, polymarket adapter, constants
src/schemas/        Zod validation schemas
migrations/         db-migrate JS wrappers + sqls/ SQL pairs
docs/               research notes, migration guide, audit report
```

`CLAUDE.md` documents conventions (SQL parameterization, Zod validation checklist) for both humans
and coding agents. `docs/disco.md` has the Polymarket API research — rate limits, WebSocket gotchas.

## Deployment

Deployed on Vercel. CI (lint, typecheck, format) runs via GitHub Actions on PRs. Migrations are run
manually against Neon — never automatically at deploy time.
