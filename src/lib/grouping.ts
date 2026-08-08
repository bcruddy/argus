import { createHash } from 'crypto';
import type { TradeGroup, TradeGroupType, GroupedTradesResponse } from '@/schemas/api';

// Grouping runs in JS over the entire result set, so the raw fetch is bounded to
// keep serverless memory (and the JSON payload) finite. Lives here rather than in
// the query module because it is the grouping strategy that forces the cap;
// queryTradesForGrouping imports it, and responses report when it was hit.
export const GROUPING_FETCH_CAP = 5000;

// A trade row after the query module has coerced its DECIMAL columns — numerics
// are real numbers by the time grouping sees them.
export interface RawTrade {
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
	title: string | null;
	category: string | null;
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
		totalValue += trade.usdc_value;
		totalWeightedPrice += trade.price * trade.usdc_value;

		if (trade.side === 'BUY') {
			netShares += trade.size;
			buyCount++;
		} else {
			netShares -= trade.size;
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
			size: t.size,
			price: t.price,
			usdcValue: t.usdc_value,
			tradeTimestamp: t.trade_timestamp,
			title: t.title,
		})),
	};
}

// Group trades by wallet + day bucket, sorted by most recent trade time then total value.
function buildTradeGroups(trades: RawTrade[]): TradeGroup[] {
	const groupsMap = new Map<string, RawTrade[]>();

	for (const trade of trades) {
		// Create a composite key for grouping: wallet + time bucket
		const timeBucket = new Date(trade.trade_timestamp).toISOString().split('T')[0];
		const groupKey = `${trade.proxy_wallet}:${timeBucket}`;

		if (!groupsMap.has(groupKey)) {
			groupsMap.set(groupKey, []);
		}
		groupsMap.get(groupKey)!.push(trade);
	}

	// Trades spanning multiple events stay in a single multi-event umbrella group;
	// splitting them per event would make the same trade appear twice.
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

	return finalGroups;
}

export function buildGroupedTradesResponse(
	trades: RawTrade[],
	timeWindowHours: number,
	limit: number,
): GroupedTradesResponse {
	// totalGroups counts everything the window produced; the slice is what ships.
	const allGroups = buildTradeGroups(trades);
	const limitedGroups = allGroups.slice(0, limit);
	const totalTrades = limitedGroups.reduce((sum, g) => sum + g.summary.tradeCount, 0);

	return {
		groups: limitedGroups,
		meta: {
			totalGroups: allGroups.length,
			returned: limitedGroups.length,
			hasMore: allGroups.length > limitedGroups.length,
			truncated: trades.length >= GROUPING_FETCH_CAP,
			totalTrades,
			timeWindowHours,
		},
	};
}
