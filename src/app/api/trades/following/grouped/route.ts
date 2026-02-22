import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import {
	groupedTradesQuerySchema,
	sanitizeForLike,
	TradeGroup,
	TradeGroupType,
	GroupedTradesResponse,
} from '@/schemas/api';
import { createHash } from 'crypto';

interface RawTrade {
	id: string;
	transaction_hash: string;
	condition_id: string;
	asset_id: string;
	outcome: string | null;
	proxy_wallet: string;
	side: 'BUY' | 'SELL';
	size: string;
	price: string;
	usdc_value: string;
	trade_timestamp: string;
	title: string | null;
	category: string | null;
	wallet_label: string | null;
}

function classifyGroupType(trades: RawTrade[]): TradeGroupType {
	const events = new Set(trades.map((t) => t.condition_id));
	const sides = new Set(trades.map((t) => t.side));

	if (events.size > 1) {
		return 'multi_event';
	}

	if (sides.size === 1) {
		return sides.has('BUY') ? 'position_building' : 'position_closing';
	}

	return 'position_adjustment';
}

function generateGroupId(wallet: string, conditionIds: string[], timeBucket: string): string {
	const data = `${wallet}:${conditionIds.sort().join(',')}:${timeBucket}`;
	return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

function buildTradeGroup(wallet: string, trades: RawTrade[], timeBucket: string): TradeGroup {
	const groupType = classifyGroupType(trades);
	const conditionIds = [...new Set(trades.map((t) => t.condition_id))];

	// Calculate summary statistics
	let totalValue = 0;
	let netShares = 0;
	let buyCount = 0;
	let sellCount = 0;
	let totalWeightedPrice = 0;

	for (const trade of trades) {
		const usdcValue = parseFloat(trade.usdc_value);
		const size = parseFloat(trade.size);
		const price = parseFloat(trade.price);

		totalValue += usdcValue;
		totalWeightedPrice += price * usdcValue;

		if (trade.side === 'BUY') {
			netShares += size;
			buyCount++;
		} else {
			netShares -= size;
			sellCount++;
		}
	}

	const avgPrice = totalValue > 0 ? totalWeightedPrice / totalValue : 0;

	// Sort trades by timestamp
	const sortedTrades = [...trades].sort(
		(a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime(),
	);

	// Extract unique events
	const eventsMap = new Map<string, { title: string | null; category: string | null }>();
	for (const trade of trades) {
		if (!eventsMap.has(trade.condition_id)) {
			eventsMap.set(trade.condition_id, {
				title: trade.title,
				category: trade.category,
			});
		}
	}

	const events = Array.from(eventsMap.entries()).map(([conditionId, data]) => ({
		conditionId,
		title: data.title,
		category: data.category,
	}));

	return {
		id: generateGroupId(wallet, conditionIds, timeBucket),
		wallet,
		groupType,
		summary: {
			totalValue: Math.round(totalValue * 100) / 100,
			netShares: Math.round(netShares * 100) / 100,
			tradeCount: trades.length,
			buyCount,
			sellCount,
			avgPrice: Math.round(avgPrice * 10000) / 10000,
			firstTradeTime: sortedTrades[0].trade_timestamp,
			lastTradeTime: sortedTrades[sortedTrades.length - 1].trade_timestamp,
		},
		events,
		trades: sortedTrades.map((t) => ({
			id: t.id,
			transactionHash: t.transaction_hash,
			conditionId: t.condition_id,
			outcome: t.outcome,
			side: t.side,
			size: parseFloat(t.size),
			price: parseFloat(t.price),
			usdcValue: parseFloat(t.usdc_value),
			tradeTimestamp: t.trade_timestamp,
			title: t.title,
		})),
	};
}

// GET /api/trades/following/grouped - Get grouped trades from followed wallets
export async function GET(request: NextRequest) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);

		// Validate and parse query parameters with Zod
		const parseResult = groupedTradesQuerySchema.safeParse({
			categories: searchParams.get('categories'),
			event: searchParams.get('event'),
			minAmount: searchParams.get('minAmount'),
			wallet: searchParams.get('wallet'),
			timeWindowHours: searchParams.get('timeWindowHours'),
			limit: searchParams.get('limit'),
		});

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid query parameters', details: parseResult.error.flatten() },
				{ status: 400 },
			);
		}

		const { categories, event, minAmount, wallet, timeWindowHours, limit } = parseResult.data;

		// Sanitize event search for LIKE query
		const sanitizedEventPattern = event ? `%${sanitizeForLike(event)}%` : null;

		// Calculate cutoff timestamp for time window filter
		const cutoffTimestamp = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

		const categoriesParam = categories || null;

		// Fetch all whale trades from followed wallets within the time window
		const tradesResult = await sql`
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
				m.tags->0 as category,
				date_trunc('day', t.trade_timestamp) as time_bucket,
				fw.label as wallet_label
			FROM trades t
			LEFT JOIN markets m ON t.market_id = m.id
			INNER JOIN followed_wallets fw ON LOWER(t.proxy_wallet) = fw.wallet_address AND fw.clerk_id = ${userId}
			WHERE t.is_whale = true
				AND t.trade_timestamp > ${cutoffTimestamp}
				AND (${categoriesParam}::text IS NULL OR m.tags ?| string_to_array(${categoriesParam}, ','))
				AND (${sanitizedEventPattern}::text IS NULL OR
					LOWER(t.title) LIKE LOWER(${sanitizedEventPattern}) OR
					LOWER(m.question) LIKE LOWER(${sanitizedEventPattern}))
				AND (${minAmount}::numeric IS NULL OR t.usdc_value >= ${minAmount})
				AND (${wallet}::text IS NULL OR t.proxy_wallet = ${wallet})
			ORDER BY t.trade_timestamp DESC
		`;
		const trades = tradesResult as unknown as RawTrade[];

		// Group trades by wallet and time bucket
		const groupsMap = new Map<string, RawTrade[]>();

		for (const trade of trades) {
			const timeBucket = new Date(trade.trade_timestamp).toISOString().split('T')[0];
			const groupKey = `${trade.proxy_wallet}:${timeBucket}`;

			if (!groupsMap.has(groupKey)) {
				groupsMap.set(groupKey, []);
			}
			groupsMap.get(groupKey)!.push(trade);
		}

		// Build final groups
		const finalGroups: TradeGroup[] = [];

		for (const [groupKey, groupTrades] of groupsMap) {
			const [walletAddr, timeBucket] = groupKey.split(':');
			finalGroups.push(buildTradeGroup(walletAddr, groupTrades, timeBucket));
		}

		// Sort groups by most recent trade time, then by total value
		finalGroups.sort((a, b) => {
			const timeA = new Date(a.summary.lastTradeTime).getTime();
			const timeB = new Date(b.summary.lastTradeTime).getTime();
			if (timeB !== timeA) return timeB - timeA;
			return b.summary.totalValue - a.summary.totalValue;
		});

		// Apply limit
		const limitedGroups = finalGroups.slice(0, limit);
		const totalTrades = limitedGroups.reduce((sum, g) => sum + g.summary.tradeCount, 0);

		const response: GroupedTradesResponse = {
			groups: limitedGroups,
			meta: {
				totalGroups: limitedGroups.length,
				totalTrades,
				timeWindowHours,
			},
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error('Failed to fetch grouped following trades:', error);
		return NextResponse.json({ error: 'Failed to fetch grouped following trades' }, { status: 500 });
	}
}
