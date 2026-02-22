import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { tradesQuerySchema, sanitizeForLike } from '@/schemas/api';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);

		// Validate and parse query parameters with Zod
		const parseResult = tradesQuerySchema.safeParse({
			limit: searchParams.get('limit'),
			offset: searchParams.get('offset'),
			sort: searchParams.get('sort'),
			order: searchParams.get('order'),
			categories: searchParams.get('categories'),
			event: searchParams.get('event'),
			minAmount: searchParams.get('minAmount'),
			wallet: searchParams.get('wallet'),
		});

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid query parameters', details: parseResult.error.flatten() },
				{ status: 400 },
			);
		}

		const { limit, offset, sort, order, categories, event, minAmount, wallet } = parseResult.data;

		// Sanitize event search for LIKE query (escape %, _, \)
		const sanitizedEventPattern = event ? `%${sanitizeForLike(event)}%` : null;

		// Build query using parameterized statements
		// Uses conditional filters with (filter IS NULL OR condition) pattern
		const orderByTime = sort === 'time';
		const orderAsc = order === 'asc';

		// Fetch limit + 1 to determine if there are more results
		const fetchLimit = limit + 1;

		// Pass categories as comma-separated string; SQL splits with string_to_array
		// The ?| operator checks if any array element exists in the JSONB tags
		const categoriesParam = categories || null;

		const results = await sql`
			SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
				t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
				t.trade_timestamp, t.is_whale, t.detection_rule,
				COALESCE(t.title, m.question) as title,
				t.created_at,
				m.tags->0 as category
			FROM trades t
			LEFT JOIN markets m ON t.market_id = m.id
			WHERE t.is_whale = true
				AND (${categoriesParam}::text IS NULL OR m.tags ?| string_to_array(${categoriesParam}, ','))
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

		return NextResponse.json({ trades, hasMore, offset });
	} catch (error) {
		console.error('Failed to fetch trades:', error);
		return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
	}
}
