-- Recreate the five dropped indexes exactly as their original migrations defined
-- them (20260111000001-create-users, 20260111000003-create-markets,
-- 20260111000004-create-trades, 20260111000006-add-title-to-trades).
CREATE INDEX idx_trades_tx_hash ON trades(transaction_hash);
CREATE INDEX idx_markets_condition_id ON markets(condition_id);
CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_trades_title ON trades(title);
CREATE INDEX idx_trades_whale ON trades(is_whale) WHERE is_whale = true;

DROP INDEX idx_trades_wallet_lower_ts;
