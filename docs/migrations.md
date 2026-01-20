# Running Neon Migrations in Claude Web Environment

This document outlines the requirements and setup needed to run database migrations against Neon PostgreSQL in the Claude Code web environment.

## Overview

Argus uses [db-migrate](https://db-migrate.readthedocs.io/) with the PostgreSQL driver to manage database schema changes. The database is hosted on [Neon](https://neon.tech), a serverless PostgreSQL platform.

## Requirements

### 1. Environment Variables

The following environment variable must be configured:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |

**Connection String Format:**
```
postgresql://[user]:[password]@[host].neon.tech/[database]?sslmode=require
```

Example:
```
postgresql://argus_owner:abc123xyz@ep-cool-darkness-123456.us-east-2.aws.neon.tech/argus?sslmode=require
```

### 2. Node.js Dependencies

The migration tooling requires these packages (already in `devDependencies`):

- `db-migrate@0.11.14` - Migration framework
- `db-migrate-pg@1.5.2` - PostgreSQL driver

### 3. Network Access

The Claude web environment must be able to reach:
- `*.neon.tech` on port 5432 (PostgreSQL)
- SSL/TLS connections are required

## Setup Instructions

### Step 1: Install Dependencies

```bash
pnpm install
```

This installs all project dependencies including the migration tools.

### Step 2: Configure DATABASE_URL

Set the `DATABASE_URL` environment variable with your Neon connection string.

**Option A: Export in terminal**
```bash
export DATABASE_URL="postgresql://user:password@host.neon.tech/database?sslmode=require"
```

**Option B: Create .env.local file**
```bash
echo 'DATABASE_URL="postgresql://user:password@host.neon.tech/database?sslmode=require"' > .env.local
```

Note: db-migrate reads directly from environment variables, not from `.env.local`. For local development, use a tool like `dotenv-cli` or export the variable directly.

### Step 3: Run Migrations

```bash
# Apply all pending migrations
pnpm db:up

# Rollback last migration
pnpm db:down

# Reset all migrations (caution: destroys data)
pnpm db:reset
```

## Migration Architecture

### File Structure

```
migrations/
├── 20260111000001-create-users.js
├── 20260111000002-create-alert-channels.js
├── 20260111000003-create-markets.js
├── 20260111000004-create-trades.js
├── 20260111000005-create-alerts.js
├── 20260111000006-add-title-to-trades.js
├── 20260111000007-create-followed-wallets.js
└── sqls/
    ├── 20260111000001-create-users-up.sql
    ├── 20260111000001-create-users-down.sql
    └── ... (up/down SQL for each migration)
```

### Configuration (database.json)

```json
{
  "dev": {
    "driver": "pg",
    "connectionString": { "ENV": "DATABASE_URL" },
    "ssl": { "rejectUnauthorized": false }
  },
  "production": {
    "driver": "pg",
    "connectionString": { "ENV": "DATABASE_URL" },
    "ssl": { "rejectUnauthorized": false }
  },
  "sql-file": true,
  "migrations-dir": "./migrations"
}
```

Key configuration notes:
- Uses `DATABASE_URL` environment variable for connection
- SSL enabled with `rejectUnauthorized: false` (required for Neon)
- SQL files stored separately in `sqls/` directory

## Claude Web Environment Specifics

### Available by Default

| Component | Status | Notes |
|-----------|--------|-------|
| Node.js 22 | Available | `/opt/node22/bin/node` |
| pnpm | Available | `/opt/node22/bin/pnpm` |
| npm | Available | `/opt/node22/bin/npm` |
| Network (outbound) | Available | Can connect to Neon servers |

### Not Available by Default

| Component | Resolution |
|-----------|------------|
| `DATABASE_URL` | Must be configured per session |
| `node_modules` | Run `pnpm install` each session |

### Recommended Session Start Hook

To automate setup, create a SessionStart hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "pnpm install --prefer-offline"
          }
        ]
      }
    ]
  }
}
```

This ensures dependencies are installed at the start of each Claude Code session.

### Setting DATABASE_URL in Claude Web

For the Claude web environment, the `DATABASE_URL` should be configured as an environment secret. Contact your administrator or check the Claude Code settings for environment variable configuration.

**Security Note:** Never commit database credentials to the repository. Use environment secrets or secure credential management.

## Troubleshooting

### Error: ECONNREFUSED 127.0.0.1:5432

**Cause:** `DATABASE_URL` is not set or is empty.

**Solution:** Ensure the `DATABASE_URL` environment variable is configured with a valid Neon connection string.

### Error: SSL connection required

**Cause:** Neon requires SSL connections by default.

**Solution:** Ensure your connection string includes `?sslmode=require` and `database.json` has SSL configured.

### Error: Role does not exist

**Cause:** The user in the connection string doesn't have access to the database.

**Solution:** Verify the credentials in your Neon dashboard at https://console.neon.tech.

### Migrations not found

**Cause:** Running from wrong directory or `migrations-dir` misconfigured.

**Solution:** Ensure you're in the project root (`/home/user/argus`) and `database.json` points to `./migrations`.

## Creating New Migrations

```bash
# Create a new migration
pnpm db:create <migration-name>

# Example
pnpm db:create add-notifications-table
```

This creates:
- `migrations/<timestamp>-add-notifications-table.js`
- `migrations/sqls/<timestamp>-add-notifications-table-up.sql`
- `migrations/sqls/<timestamp>-add-notifications-table-down.sql`

Edit the SQL files to define your schema changes.

## Database Schema Summary

The current migrations create these tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts synced from Clerk |
| `alert_channels` | Notification preferences (telegram, discord, webhook) |
| `markets` | Polymarket market metadata |
| `trades` | Trade history with whale detection flags |
| `alerts` | Sent notification records |
| `followed_wallets` | User wallet tracking |

## Quick Reference

```bash
# Full setup from scratch
pnpm install
export DATABASE_URL="your-neon-connection-string"
pnpm db:up

# Check migration status
pnpm db:up --dry-run

# Create new migration
pnpm db:create my-new-migration
```
