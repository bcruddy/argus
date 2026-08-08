import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { fetchWhaleTrades, calculateUsdValue } from '@/lib/polymarket';
import { syncMarketsForConditionIds } from '@/lib/marketSync';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { WHALE_THRESHOLD_DEFAULT } from '@/lib/constants';

export const maxDuration = 60;

interface IngestSummary {
	fetched: number;
	new: number;
	skippedBelowThreshold: number;
	insertFailures: number;
}

async function runIngest(): Promise<IngestSummary> {
	const summary: IngestSummary = { fetched: 0, new: 0, skippedBelowThreshold: 0, insertFailures: 0 };

	const trades = await fetchWhaleTrades({ minAmount: WHALE_THRESHOLD_DEFAULT });
	summary.fetched = trades.length;

	if (trades.length === 0) return summary;

	const hashes = trades.map((t) => t.transactionHash);
	const existing = await sql`
		SELECT transaction_hash FROM trades
		WHERE transaction_hash = ANY(${hashes})
	`;
	const existingHashes = new Set(existing.map((r) => r.transaction_hash));

	// Recompute the threshold locally instead of trusting Polymarket's
	// filterAmount — a stored row is already $246,912 while labeled
	// threshold_250k (audit 2026-08-07).
	const newTrades = trades.filter((trade) => {
		if (existingHashes.has(trade.transactionHash)) return false;
		if (calculateUsdValue(trade.size, trade.price) < WHALE_THRESHOLD_DEFAULT) {
			summary.skippedBelowThreshold++;
			return false;
		}
		return true;
	});

	if (newTrades.length === 0) return summary;

	const uniqueConditionIds = [...new Set(newTrades.map((t) => t.conditionId))];
	const conditionToMarketId = await syncMarketsForConditionIds(uniqueConditionIds);

	for (const trade of newTrades) {
		const usdcValue = calculateUsdValue(trade.size, trade.price);
		const tradeTimestamp = new Date(trade.timestamp * 1000);
		const marketId = conditionToMarketId.get(trade.conditionId) || null;

		try {
			// ON CONFLICT covers the race between the cron run and a dashboard
			// Refresh: the existing-hash pre-check above is only an optimization.
			const inserted = (await sql`
				INSERT INTO trades (
					transaction_hash,
					market_id,
					condition_id,
					asset_id,
					outcome,
					proxy_wallet,
					side,
					size,
					price,
					usdc_value,
					trade_timestamp,
					is_whale,
					detection_rule,
					title
				) VALUES (
					${trade.transactionHash},
					${marketId},
					${trade.conditionId},
					${trade.asset},
					${trade.outcome || null},
					${trade.proxyWallet},
					${trade.side},
					${trade.size},
					${trade.price},
					${usdcValue},
					${tradeTimestamp},
					true,
					'threshold_250k',
					${trade.title || null}
				)
				ON CONFLICT (transaction_hash) DO NOTHING
				RETURNING id
			`) as { id: string }[];

			summary.new += inserted.length;
		} catch (error) {
			// One bad row must not abandon the rest of the batch.
			summary.insertFailures++;
			console.error(`[ingest] insert failed for ${trade.transactionHash}:`, error);
		}
	}

	return summary;
}

async function handleIngest(): Promise<NextResponse> {
	try {
		const summary = await runIngest();
		console.log(
			`[ingest] Done: fetched=${summary.fetched}, new=${summary.new}, skippedBelowThreshold=${summary.skippedBelowThreshold}, insertFailures=${summary.insertFailures}`,
		);
		return NextResponse.json(summary);
	} catch (error) {
		console.error('Ingestion error:', error);
		return NextResponse.json({ error: 'Failed to ingest trades' }, { status: 500 });
	}
}

// Vercel Cron issues GET and authenticates with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	return handleIngest();
}

// The dashboard Refresh button.
export async function POST() {
	// Defense in depth: the proxy middleware treats this route as public so cron
	// can reach GET, which makes this session check the only gate on POST.
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	return handleIngest();
}
