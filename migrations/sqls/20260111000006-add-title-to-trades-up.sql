ALTER TABLE trades ADD COLUMN title TEXT;
CREATE INDEX idx_trades_title ON trades(title);
