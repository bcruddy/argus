// Polymarket API URLs
export const POLYMARKET_DATA_API_URL = process.env.POLYMARKET_DATA_API_URL || 'https://data-api.polymarket.com';
export const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
export const POLYMARKET_GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com';
export const POLYMARKET_WS_URL =
	process.env.POLYMARKET_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// Doomscroll category filter - politics & geopolitics
export const DOOMSCROLL_CATEGORIES = ['Geopolitics', 'Politics', 'Iran', 'Israel'];

// Ingestion paging limits
export const INGEST_MAX_DAYS_BACK = 364;
export const INGEST_MIN_WHALE_TRADES = 10;

// Whale detection thresholds
export const WHALE_THRESHOLD_DEFAULT = Number(process.env.WHALE_THRESHOLD_DEFAULT || 250000);
export const WHALE_THRESHOLD_NEAR_EXPIRY = Number(process.env.WHALE_THRESHOLD_NEAR_EXPIRY || 15000);
export const EXPIRY_WINDOW_HOURS_DEFAULT = Number(process.env.EXPIRY_WINDOW_HOURS_DEFAULT || 1);
export const EXPIRY_WINDOW_HOURS_GEOPOLITICS = Number(process.env.EXPIRY_WINDOW_HOURS_GEOPOLITICS || 168);
