# Database Migrations

Argus uses [db-migrate](https://db-migrate.readthedocs.io/) with the PostgreSQL driver against
[Neon](https://neon.tech).

> **The one gotcha:** db-migrate reads `DATABASE_URL` from the **real environment**, not from
> `.env.local`. Export it before running any `db:` script:
>
> ```bash
> export DATABASE_URL="postgresql://user:password@host.neon.tech/database?sslmode=require"
> pnpm db:up
> ```

## Commands

```bash
pnpm db:up               # Apply all pending migrations
pnpm db:up --dry-run     # Check migration status
pnpm db:down             # Rollback last migration
pnpm db:reset            # Reset all migrations (caution: destroys data)
pnpm db:create <name>    # Create a new migration
```

`pnpm db:create add-notifications-table` creates:

- `migrations/<timestamp>-add-notifications-table.js` (wrapper — don't edit)
- `migrations/sqls/<timestamp>-add-notifications-table-up.sql`
- `migrations/sqls/<timestamp>-add-notifications-table-down.sql`

Edit the SQL pair; every migration must have a working `down`.

**Never run migrations automatically at deploy time.** They are applied manually, deliberately.

## Configuration (database.json)

```json
{
	"dev": {
		"driver": "pg",
		"connectionString": { "ENV": "DATABASE_URL" },
		"ssl": true
	},
	"production": {
		"driver": "pg",
		"connectionString": { "ENV": "DATABASE_URL" },
		"ssl": true
	},
	"sql-file": true,
	"migrations-dir": "./migrations"
}
```

Notes:

- `"ssl": true` verifies Neon's certificate (publicly-trusted CA). Do **not** use
  `"rejectUnauthorized": false` — it accepts any certificate and exposes credentials to MITM.
- SQL files live in `migrations/sqls/` as up/down pairs; the JS files are generated wrappers.

## Current Schema

| Table              | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `users`            | User accounts synced from Clerk (webhook is a stub; currently empty) |
| `alert_channels`   | Notification preferences (unused until alerting ships)               |
| `markets`          | Polymarket market metadata                                           |
| `trades`           | Trade history with whale detection flags                             |
| `alerts`           | Sent notification records (unused until alerting ships)              |
| `followed_wallets` | Per-user wallet watchlist                                            |

## Troubleshooting

| Error                         | Cause / fix                                                              |
| ----------------------------- | ------------------------------------------------------------------------ |
| `ECONNREFUSED 127.0.0.1:5432` | `DATABASE_URL` not set in the real env — export it (see top of this doc) |
| SSL connection required       | Connection string must include `?sslmode=require`                        |
| Role does not exist           | Bad credentials — check https://console.neon.tech                        |
| Migrations not found          | Run from the project root; `database.json` points at `./migrations`      |

## Appendix: Claude Web Environment

Only relevant when running migrations from a Claude Code web sandbox:

- Node 22 / pnpm live at `/opt/node22/bin/`; run `pnpm install` each session (no persisted
  `node_modules`).
- `DATABASE_URL` must be configured as an environment secret per session.
- Optionally automate installs with a SessionStart hook in `.claude/settings.json` running
  `pnpm install --prefer-offline`.
- Never commit database credentials to the repository.
