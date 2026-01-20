import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { tradesQuerySchema, sanitizeForLike } from '@/schemas/api';

// GET /api/trades/following - Get trades from wallets the user is following
export async function GET(request: NextRequest) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);

		// Validate and parse query parameters with Zod
		const parseResult = tradesQuerySchema.safeParse({
			limit: searchParams.get('limit'),
			sort: searchParams.get('sort'),
			order: searchParams.get('order'),
			category: searchParams.get('category'),
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

		const { limit, sort, order, category, event, minAmount, wallet } = parseResult.data;

		// Sanitize event search for LIKE query (escape %, _, \)
		const sanitizedEventPattern = event ? `%${sanitizeForLike(event)}%` : null;

		// Build query using parameterized statements
		const orderByTime = sort === 'time';
		const orderAsc = order === 'asc';

		// Query trades only from wallets the user is following
		const trades = await sql`
			SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
				t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
				t.trade_timestamp, t.is_whale, t.detection_rule,
				COALESCE(t.title, m.question) as title,
				t.created_at,
				m.tags->0 as category,
				fw.label as wallet_label
			FROM trades t
			LEFT JOIN markets m ON t.market_id = m.id
			INNER JOIN followed_wallets fw ON LOWER(t.proxy_wallet) = fw.wallet_address AND fw.clerk_id = ${userId}
			WHERE t.is_whale = true
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
			LIMIT ${limit}
		`;

		return NextResponse.json({ trades });
	} catch (error) {
		console.error('Failed to fetch following trades:', error);
		return NextResponse.json({ error: 'Failed to fetch following trades' }, { status: 500 });
	}
}
