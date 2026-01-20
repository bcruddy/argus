CREATE TABLE followed_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    label VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clerk_id, wallet_address)
);

CREATE INDEX idx_followed_wallets_clerk_id ON followed_wallets(clerk_id);
CREATE INDEX idx_followed_wallets_wallet_address ON followed_wallets(wallet_address);
