# CLAUDE.md - Argus Project

## Project Overview

Argus is a Polymarket whale trade detection system: it ingests large trades from Polymarket's
public APIs, stores them in Postgres, and serves an authenticated dashboard for browsing whale
activity and following wallets.

**Implementation status** (keep this honest — see `docs/audit-2026-08-07.md`):

- Working: ingestion (manually triggered), dashboard, wallet following
- NOT implemented: alert delivery (Telegram/Discord), the near-expiry and geopolitics detection
  rules, Clerk→`users` webhook sync. The `alerts`/`alert_channels` tables and
  `src/schemas/{alert,channel}.ts` are scaffolding for that future work.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript
- **Database**: PostgreSQL via Neon.com
- **Migrations**: db-migrate
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui + Tailwind CSS
- **Validation**: Zod
- **Authentication**: Clerk (personal workspaces only, no organizations)

## Key Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm typecheck    # tsc --noEmit
pnpm format:check # Prettier check (CI gate)
pnpm db:up        # Run database migrations (reads DATABASE_URL from real env, not .env.local)
pnpm db:down      # Rollback last migration
pnpm db:create    # Create new migration
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages and API routes
├── components/ui/    # shadcn/ui components
├── lib/              # Utilities (db, queryClient, constants)
├── schemas/          # Zod validation schemas
├── hooks/            # React Query hooks
└── proxy.ts          # Clerk auth middleware (Next 16 renamed middleware.ts -> proxy.ts)

migrations/           # db-migrate SQL migrations
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

- Clerk API keys (from dashboard.clerk.com)
- Neon DATABASE_URL
- CRON_SECRET for operator endpoints (`/api/backfill`)

## Authentication

Using Clerk for auth with personal workspaces only (no organizations).

- Public routes (see `src/proxy.ts`): `/sign-in`, `/sign-up`, `/api/webhooks`, `/api/health`,
  `/api/backfill` (self-protects with CRON_SECRET bearer token)
- Everything else — including `/` — requires authentication
- Middleware returns 401 JSON for unauthenticated `/api/*` calls and redirects for pages
- Defense in depth: route handlers also call `auth()` themselves; never rely on the proxy alone

## Database Schema

Six tables:

- `users` - Intended to sync from Clerk via webhooks (webhook handler is a stub; table is empty)
- `alert_channels` - User notification preferences (unused until alerting ships)
- `markets` - Polymarket market metadata (tags are a `string[]` jsonb, e.g. `["Sports","NBA"]`)
- `trades` - Trade history with whale detection
- `alerts` - Sent notification records (unused until alerting ships)
- `followed_wallets` - Per-user wallet watchlist, keyed on `clerk_id` directly (no FK to `users`)

## Whale Detection Rules

- **Default** (implemented): $250k+ trades, fetched via the data API's `filterAmount`
- **Near expiry** (NOT implemented): $15k+ within 1 hour of market close
- **Geopolitics** (NOT implemented): $15k+ within 168 hours for geopolitical markets

Thresholds live in `src/lib/constants.ts` and are env-overridable.

## Security Guidelines

### SQL Injection Prevention

**CRITICAL**: All database queries MUST use parameterized statements. Never concatenate user input into SQL strings.

#### Using Neon's Tagged Template Literals

Neon's `sql` function uses tagged template literals that automatically parameterize interpolated values:

```typescript
// CORRECT - Values are parameterized
const result = await sql`
  SELECT * FROM trades WHERE category = ${userInput}
`;

// WRONG - String concatenation is vulnerable
const result = await sql`
  SELECT * FROM trades WHERE category = '${userInput}'
`;
```

#### LIKE Query Patterns

When using LIKE queries with user input, sanitize wildcard characters:

```typescript
import { sanitizeForLike } from '@/schemas/api';

// Escape %, _, and \ characters before using in LIKE
const sanitizedPattern = `%${sanitizeForLike(userInput)}%`;
const result = await sql`
  SELECT * FROM trades WHERE title LIKE ${sanitizedPattern}
`;
```

### Input Validation with Zod

**All API endpoints MUST validate input using Zod schemas** before processing:

```typescript
import { z } from 'zod';

// Define schema with strict validation
const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	category: z
		.string()
		.max(100)
		.regex(/^[a-zA-Z0-9\s\-_]+$/)
		.optional(),
});

// In API route
const parseResult = querySchema.safeParse(searchParams);
if (!parseResult.success) {
	return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
}
```

#### Validation Best Practices

1. **Always use `safeParse`** - Returns result object instead of throwing
2. **Set maximum lengths** - Prevent DoS via oversized inputs
3. **Use regex patterns** - Restrict allowed characters for identifiers
4. **Coerce types explicitly** - Use `z.coerce.number()` for query params
5. **Define sensible defaults** - Use `.default()` for optional params

### API Schema Location

All API validation schemas are in `src/schemas/api.ts`:

- `tradesQuerySchema` - Validates /api/trades query parameters
- `sanitizeForLike()` - Escapes SQL LIKE wildcards

### Security Checklist for New API Routes

- [ ] Define Zod schema for all query/body parameters
- [ ] Use `safeParse()` and return 400 on validation failure
- [ ] Use Neon's tagged template literals for all SQL queries
- [ ] Sanitize strings used in LIKE clauses with `sanitizeForLike()`
- [ ] Set appropriate max lengths on string inputs
- [ ] Validate numeric ranges (min/max)
- [ ] Never log sensitive data or full error stacks to client
