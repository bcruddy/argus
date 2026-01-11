CREATE TYPE trade_side AS ENUM ('BUY', 'SELL');

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_hash VARCHAR(255) UNIQUE NOT NULL,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    condition_id VARCHAR(255) NOT NULL,
    asset_id VARCHAR(255) NOT NULL,
    outcome VARCHAR(50),
    proxy_wallet VARCHAR(255) NOT NULL,
    side trade_side NOT NULL,
    size DECIMAL(30, 10) NOT NULL,
    price DECIMAL(10, 8) NOT NULL,
    usdc_value DECIMAL(20, 6) NOT NULL,
    trade_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    is_whale BOOLEAN DEFAULT false,
    detection_rule VARCHAR(100),
    time_to_expiry_hours DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trades_market_id ON trades(market_id);
CREATE INDEX idx_trades_condition_id ON trades(condition_id);
CREATE INDEX idx_trades_proxy_wallet ON trades(proxy_wallet);
CREATE INDEX idx_trades_usdc_value ON trades(usdc_value);
CREATE INDEX idx_trades_whale ON trades(is_whale) WHERE is_whale = true;
CREATE INDEX idx_trades_timestamp ON trades(trade_timestamp DESC);
CREATE INDEX idx_trades_tx_hash ON trades(transaction_hash);
