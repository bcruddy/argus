import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { tradesQuerySchema, sanitizeForLike } from '@/schemas/api';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);

		// Validate and parse query parameters with Zod
		const parseResult = tradesQuerySchema.safeParse({
			limit: searchParams.get('limit'),
			sort: searchParams.get('sort'),
			order: searchParams.get('order'),
			category: searchParams.get('category'),
			event: searchParams.get('event'),
			minAmount: searchParams.get('minAmount'),
		});

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid query parameters', details: parseResult.error.flatten() },
				{ status: 400 },
			);
		}

		const { limit, sort, order, category, event, minAmount } = parseResult.data;

		// Sanitize event search for LIKE query (escape %, _, \)
		const sanitizedEventPattern = event ? `%${sanitizeForLike(event)}%` : null;

		// Build query using parameterized statements
		// Neon's sql tagged template automatically parameterizes all interpolated values
		const orderByTime = sort === 'time';
		const orderAsc = order === 'asc';

		let trades;

		// Query execution with all filter combinations
		// Each interpolated value (${...}) is automatically parameterized by Neon
		if (category && sanitizedEventPattern && minAmount != null) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND m.tags ? ${category}
					AND (LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
					AND t.usdc_value >= ${minAmount}
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else if (category && sanitizedEventPattern) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND m.tags ? ${category}
					AND (LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else if (category && minAmount != null) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND m.tags ? ${category}
					AND t.usdc_value >= ${minAmount}
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else if (sanitizedEventPattern && minAmount != null) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND (LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
					AND t.usdc_value >= ${minAmount}
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else if (category) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND m.tags ? ${category}
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else if (sanitizedEventPattern) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND (LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else if (minAmount != null) {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
					AND t.usdc_value >= ${minAmount}
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		} else {
			trades = await sql`
				SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
					t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
					t.trade_timestamp, t.is_whale, t.detection_rule,
					COALESCE(t.title, m.question) as title,
					t.created_at,
					m.tags->0 as category
				FROM trades t
				LEFT JOIN markets m ON t.market_id = m.id
				WHERE t.is_whale = true
				ORDER BY
					CASE WHEN ${orderByTime} AND ${orderAsc} THEN t.trade_timestamp END ASC,
					CASE WHEN ${orderByTime} AND NOT ${orderAsc} THEN t.trade_timestamp END DESC,
					CASE WHEN NOT ${orderByTime} AND ${orderAsc} THEN t.usdc_value END ASC,
					CASE WHEN NOT ${orderByTime} AND NOT ${orderAsc} THEN t.usdc_value END DESC
				LIMIT ${limit}
			`;
		}

		return NextResponse.json({ trades });
	} catch (error) {
		console.error('Failed to fetch trades:', error);
		return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
	}
}
