import { sql } from '@/lib/db';
import { sanitizeForLike, type TradesQuery, type GroupedTradesQuery } from '@/schemas/api';
import { GROUPING_FETCH_CAP, type RawTrade } from '@/lib/grouping';

// The four trades endpoints differ only in whether rows are restricted to the
// wallets a user follows. The Neon HTTP driver treats every interpolation as a
// bind parameter (there is no fragment composition), so the scope is expressed as
// a nullable clerk_id parameter that both the join and the filter read.
export type TradeScope = { kind: 'all' } | { kind: 'following'; clerkId: string };

// The row shape both trades endpoints return. `wallet_label` is null unless the
// viewer follows the wallet; `category` is the matched tag when the request filtered
// by one, otherwise the market's first tag.
export interface TradeRow {
	id: string;
	transaction_hash: string;
	condition_id: string;
	asset_id: string;
	outcome: string | null;
	proxy_wallet: string;
	side: 'BUY' | 'SELL';
	size: number;
	price: number;
	usdc_value: number;
	trade_timestamp: string;
	is_whale: boolean;
	detection_rule: string | null;
	title: string | null;
	created_at: string;
	category: string | null;
	wallet_label: string | null;
}

// What the driver actually hands back: DECIMAL arrives as a string
// ("246912.137472") and TIMESTAMPTZ as a Date. The mappers below are the single
// place those become the types the interfaces above claim — after this boundary the
// numbers are numbers everywhere (response JSON, grouping math, client schemas).
// Timestamps normalize to the same ISO text JSON.stringify would have produced, so
// the wire format is unchanged.
type TradeRowWire = Omit<TradeRow, 'size' | 'price' | 'usdc_value' | 'trade_timestamp' | 'created_at'> & {
	size: string | number;
	price: string | number;
	usdc_value: string | number;
	trade_timestamp: string | Date;
	created_at: string | Date;
};

type RawTradeWire = Omit<RawTrade, 'size' | 'price' | 'usdc_value' | 'trade_timestamp'> & {
	size: string | number;
	price: string | number;
	usdc_value: string | number;
	trade_timestamp: string | Date;
};

function toIsoString(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : value;
}

function toTradeRow(row: TradeRowWire): TradeRow {
	return {
		...row,
		size: Number(row.size),
		price: Number(row.price),
		usdc_value: Number(row.usdc_value),
		trade_timestamp: toIsoString(row.trade_timestamp),
		created_at: toIsoString(row.created_at),
	};
}

function toRawTrade(row: RawTradeWire): RawTrade {
	return {
		...row,
		size: Number(row.size),
		price: Number(row.price),
		usdc_value: Number(row.usdc_value),
		trade_timestamp: toIsoString(row.trade_timestamp),
	};
}

export interface TradesResult {
	trades: TradeRow[];
	hasMore: boolean;
	offset: number;
}

function clerkIdFor(scope: TradeScope): string | null {
	return scope.kind === 'following' ? scope.clerkId : null;
}

export async function queryTrades(params: TradesQuery, scope: TradeScope): Promise<TradesResult> {
	const { limit, offset, sort, order, category, event, minAmount, wallet } = params;
	const clerkId = clerkIdFor(scope);

	// Sanitize event search for LIKE query (escape %, _, \)
	const sanitizedEventPattern = event ? `%${sanitizeForLike(event)}%` : null;

	// Build query using parameterized statements
	// Uses conditional filters with (filter IS NULL OR condition) pattern
	const orderByTime = sort === 'time';
	const orderAsc = order === 'asc';

	// Fetch limit + 1 to determine if there are more results
	const fetchLimit = limit + 1;

	const results = await sql`
		SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
			t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
			t.trade_timestamp, t.is_whale, t.detection_rule,
			COALESCE(t.title, m.question) as title,
			t.created_at,
			-- A filtered request matched ANY tag, so display the tag that matched;
			-- tags->>0 alone labels an "NBA" filter result "Sports".
			COALESCE(${category}, m.tags->>0) as category,
			fw.label as wallet_label
		FROM trades t
		LEFT JOIN markets m ON t.market_id = m.id
		LEFT JOIN followed_wallets fw ON LOWER(t.proxy_wallet) = fw.wallet_address AND fw.clerk_id = ${clerkId}
		WHERE t.is_whale = true
			AND (${clerkId}::text IS NULL OR fw.id IS NOT NULL)
			AND (${category}::text IS NULL OR m.tags ? ${category})
			AND (${sanitizedEventPattern}::text IS NULL OR
				LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR
				LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
			AND (${minAmount}::numeric IS NULL OR t.usdc_value >= ${minAmount})
			AND (${wallet}::text IS NULL OR LOWER(t.proxy_wallet) = ${wallet})
		ORDER BY
			CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
			CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
			CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
			CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC,
			-- Unique tiebreaker: 46 rows share 17 usdc_value values, and without it
			-- LIMIT/OFFSET paging can repeat one tied row and skip its sibling.
			CASE WHEN ${orderAsc} THEN t.id END ASC,
			CASE WHEN NOT ${orderAsc} THEN t.id END DESC
		LIMIT ${fetchLimit}
		OFFSET ${offset}
	`;

	// Check if there are more results beyond the requested limit
	const hasMore = results.length > limit;
	const page = hasMore ? results.slice(0, limit) : results;
	const trades = (page as unknown as TradeRowWire[]).map(toTradeRow);

	return { trades, hasMore, offset };
}

export async function queryTradesForGrouping(params: GroupedTradesQuery, scope: TradeScope): Promise<RawTrade[]> {
	const { category, event, minAmount, wallet, timeWindowHours } = params;
	const clerkId = clerkIdFor(scope);

	// Sanitize event search for LIKE query
	const sanitizedEventPattern = event ? `%${sanitizeForLike(event)}%` : null;

	// Calculate cutoff timestamp for time window filter
	const cutoffTimestamp = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

	// Fetch all whale trades within the time window (grouping happens in JS)
	const results = await sql`
		SELECT
			t.id,
			t.transaction_hash,
			t.condition_id,
			t.asset_id,
			t.outcome,
			t.proxy_wallet,
			t.side,
			t.size,
			t.price,
			t.usdc_value,
			t.trade_timestamp,
			COALESCE(t.title, m.question) as title,
			-- Same reconciliation as queryTrades: show the tag the filter matched.
			COALESCE(${category}, m.tags->>0) as category,
			-- Time bucket for grouping (truncate to day for simplicity)
			date_trunc('day', t.trade_timestamp) as time_bucket
		FROM trades t
		LEFT JOIN markets m ON t.market_id = m.id
		LEFT JOIN followed_wallets fw ON LOWER(t.proxy_wallet) = fw.wallet_address AND fw.clerk_id = ${clerkId}
		WHERE t.is_whale = true
			AND (${clerkId}::text IS NULL OR fw.id IS NOT NULL)
			AND t.trade_timestamp > ${cutoffTimestamp}
			AND (${category}::text IS NULL OR m.tags ? ${category})
			AND (${sanitizedEventPattern}::text IS NULL OR
				LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR
				LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
			AND (${minAmount}::numeric IS NULL OR t.usdc_value >= ${minAmount})
			AND (${wallet}::text IS NULL OR LOWER(t.proxy_wallet) = ${wallet})
		ORDER BY t.trade_timestamp DESC, t.id DESC
		LIMIT ${GROUPING_FETCH_CAP}
	`;

	return (results as unknown as RawTradeWire[]).map(toRawTrade);
}
