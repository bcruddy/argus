import { sql } from '@/lib/db';
import { sanitizeForLike, type TradesQuery, type GroupedTradesQuery } from '@/schemas/api';
import type { RawTrade } from '@/lib/grouping';

// The four trades endpoints differ only in whether rows are restricted to the
// wallets a user follows. The Neon HTTP driver treats every interpolation as a
// bind parameter (there is no fragment composition), so the scope is expressed as
// a nullable clerk_id parameter that both the join and the filter read.
export type TradeScope = { kind: 'all' } | { kind: 'following'; clerkId: string };

// Rows are handed straight to NextResponse.json; nothing on the server inspects
// them. DECIMAL columns arrive as strings — coercing them is a phase 4 fix.
export type TradeRow = Record<string, unknown>;

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
			m.tags->>0 as category,
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
			AND (${wallet}::text IS NULL OR t.proxy_wallet = ${wallet})
		ORDER BY
			CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
			CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
			CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
			CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
		LIMIT ${fetchLimit}
		OFFSET ${offset}
	`;

	// Check if there are more results beyond the requested limit
	const hasMore = results.length > limit;
	const trades = hasMore ? results.slice(0, limit) : results;

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
			m.tags->>0 as category,
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
			AND (${wallet}::text IS NULL OR t.proxy_wallet = ${wallet})
		ORDER BY t.trade_timestamp DESC
	`;

	return results as unknown as RawTrade[];
}
