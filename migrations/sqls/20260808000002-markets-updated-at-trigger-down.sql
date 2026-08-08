DROP TRIGGER IF EXISTS alert_channels_set_updated_at ON alert_channels;
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
DROP TRIGGER IF EXISTS markets_set_updated_at ON markets;

DROP FUNCTION IF EXISTS set_updated_at();
