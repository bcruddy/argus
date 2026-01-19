# CLAUDE.md - Hermes Project

## Project Overview

Hermes is a Polymarket whale trade detection system that monitors for large trades and sends real-time alerts.

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
pnpm db:up        # Run database migrations
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
└── middleware.ts     # Clerk authentication middleware

migrations/           # db-migrate SQL migrations
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

- Clerk API keys (from dashboard.clerk.com)
- Neon DATABASE_URL
- Notification tokens (Telegram, Discord) when needed

## Authentication

Using Clerk for auth with personal workspaces only (no organizations).

- Public routes: `/`, `/sign-in`, `/sign-up`, `/api/webhooks`, `/api/health`
- All other routes require authentication

## Database Schema

Five main tables:

- `users` - Synced from Clerk via webhooks
- `alert_channels` - User notification preferences
- `markets` - Polymarket market metadata
- `trades` - Trade history with whale detection
- `alerts` - Sent notification records

## Whale Detection Rules

- **Default**: $250k+ trades trigger alerts
- **Near expiry**: $15k+ trades within 1 hour of market close
- **Geopolitics**: $15k+ trades within 168 hours (1 week) for geopolitical markets

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
  category: z.string().max(100).regex(/^[a-zA-Z0-9\s\-_]+$/).optional(),
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
