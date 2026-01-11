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
