import { createHash } from 'crypto';
import type { TradeGroup, TradeGroupType, GroupedTradesResponse } from '@/schemas/api';

// Wire shape of a trade row as the Neon driver returns it: DECIMAL columns arrive
// as strings, which is why size/price/usdc_value are parsed rather than used directly.
export interface RawTrade {
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
	// Apply limit
	const limitedGroups = buildTradeGroups(trades).slice(0, limit);
	const totalTrades = limitedGroups.reduce((sum, g) => sum + g.summary.tradeCount, 0);

	return {
		groups: limitedGroups,
		meta: {
			totalGroups: limitedGroups.length,
			totalTrades,
			timeWindowHours,
		},
	};
}
