import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
		const sort = searchParams.get('sort') || 'time';
		const order = searchParams.get('order') || 'desc';
		const category = searchParams.get('category');
		const event = searchParams.get('event');
		const minAmount = searchParams.get('minAmount') ? Number(searchParams.get('minAmount')) : null;

		let trades;

		// Since neon uses tagged template literals, we need separate queries for different filter combinations
		const orderByTime = sort === 'time';
		const orderAsc = order === 'asc';

		if (category && event && minAmount !== null) {
			// All filters
			if (orderByTime) {
				trades = orderAsc
					? await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else if (category && event) {
			// Category and event only
			if (orderByTime) {
				trades = orderAsc
					? await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
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
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else if (category && minAmount !== null) {
			// Category and minAmount
			if (orderByTime) {
				trades = orderAsc
					? await sql`
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
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
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
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
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
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
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
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else if (event && minAmount !== null) {
			// Event and minAmount
			if (orderByTime) {
				trades = orderAsc
					? await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
							AND t.usdc_value >= ${minAmount}
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else if (category) {
			// Category only
			if (orderByTime) {
				trades = orderAsc
					? await sql`
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
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
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
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
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
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
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
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else if (event) {
			// Event only
			if (orderByTime) {
				trades = orderAsc
					? await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
							AND (LOWER(t.title) LIKE LOWER(${'%' + event + '%'}) OR LOWER(m.question) LIKE LOWER(${'%' + event + '%'}))
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else if (minAmount !== null) {
			// minAmount only
			if (orderByTime) {
				trades = orderAsc
					? await sql`
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
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
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
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
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
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
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
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		} else {
			// No filters
			if (orderByTime) {
				trades = orderAsc
					? await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
						ORDER BY t.trade_timestamp ASC
						LIMIT ${limit}
					`
					: await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
						ORDER BY t.trade_timestamp DESC
						LIMIT ${limit}
					`;
			} else {
				trades = orderAsc
					? await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
						ORDER BY t.usdc_value ASC
						LIMIT ${limit}
					`
					: await sql`
						SELECT t.id, t.transaction_hash, t.condition_id, t.asset_id, t.outcome,
							t.proxy_wallet, t.side, t.size, t.price, t.usdc_value,
							t.trade_timestamp, t.is_whale, t.detection_rule,
							COALESCE(t.title, m.question) as title,
							t.created_at,
							m.tags->0 as category
						FROM trades t
						LEFT JOIN markets m ON t.market_id = m.id
						WHERE t.is_whale = true
						ORDER BY t.usdc_value DESC
						LIMIT ${limit}
					`;
			}
		}

		return NextResponse.json({ trades });
	} catch (error) {
		console.error('Failed to fetch trades:', error);
		return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
	}
}
