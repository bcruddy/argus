-- Index tuning from the 2026-08-07 audit. Scan counts below are real, read from
-- pg_stat_user_indexes against the live database.

-- Missing index. /api/trades/following and its grouped sibling join
-- LOWER(t.proxy_wallet) = fw.wallet_address, and the wallet filter now compares
-- LOWER(proxy_wallet) too, so plain idx_trades_proxy_wallet cannot serve either
-- (it indexes the raw column, not the expression) and both planned as Seq Scans.
-- trade_timestamp DESC rides along because every one of those queries sorts or
-- range-filters on it. Not CONCURRENTLY: db-migrate wraps each migration in a
-- transaction, and at 589 rows the write lock is momentary.
CREATE INDEX idx_trades_wallet_lower_ts ON trades (LOWER(proxy_wallet), trade_timestamp DESC);

-- Dead indexes, all measured at 0 scans. Each is either a duplicate of an index
-- Postgres already created for a UNIQUE constraint, or structurally unusable:

--   duplicate of trades_transaction_hash_key (UNIQUE on trades.transaction_hash)
DROP INDEX idx_trades_tx_hash;

--   duplicate of markets_condition_id_key (UNIQUE on markets.condition_id)
DROP INDEX idx_markets_condition_id;

--   duplicate of users_clerk_id_key (UNIQUE on users.clerk_id)
DROP INDEX idx_users_clerk_id;

--   title is only ever queried as LOWER(title) LIKE '%…%'; a leading wildcard on a
--   btree over the raw column can never be used
DROP INDEX idx_trades_title;

--   indexes is_whale inside a partial predicate on is_whale = true, so the indexed
--   column is constant for every entry: it degenerates to "the set of whale rows",
--   which every trades query already gets from idx_trades_timestamp while that index
--   also satisfies the ORDER BY. Hence 0 scans.
DROP INDEX idx_trades_whale;
