CREATE TYPE channel_type AS ENUM ('telegram', 'discord', 'webhook');

CREATE TABLE alert_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type channel_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    threshold_default INTEGER,
    threshold_near_expiry INTEGER,
    expiry_window_hours INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_channels_user_id ON alert_channels(user_id);
CREATE INDEX idx_alert_channels_type ON alert_channels(type);
CREATE INDEX idx_alert_channels_active ON alert_channels(is_active) WHERE is_active = true;
