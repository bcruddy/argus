CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition_id VARCHAR(255) UNIQUE NOT NULL,
    slug VARCHAR(255),
    question TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    tags JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    is_closed BOOLEAN DEFAULT false,
    end_date TIMESTAMP WITH TIME ZONE,
    closed_time TIMESTAMP WITH TIME ZONE,
    outcomes JSONB DEFAULT '[]',
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_markets_condition_id ON markets(condition_id);
CREATE INDEX idx_markets_slug ON markets(slug);
CREATE INDEX idx_markets_active ON markets(is_active) WHERE is_active = true;
CREATE INDEX idx_markets_end_date ON markets(end_date);
CREATE INDEX idx_markets_tags ON markets USING GIN(tags);
