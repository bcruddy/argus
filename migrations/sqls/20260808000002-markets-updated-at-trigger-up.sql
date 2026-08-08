-- markets.updated_at never advances: all 359 rows have updated_at = created_at
-- while 245 have a newer last_synced_at, because the market upsert's DO UPDATE SET
-- list never touches it. users and alert_channels carry the same column with the
-- same default and the same latent bug, so all three get the trigger.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER markets_set_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER alert_channels_set_updated_at
    BEFORE UPDATE ON alert_channels
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
