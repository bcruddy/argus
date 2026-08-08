import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { fetchWhaleTrades, calculateUsdValue } from '@/lib/polymarket';
import { syncMarketsForConditionIds } from '@/lib/marketSync';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { WHALE_THRESHOLD_DEFAULT } from '@/lib/constants';

export const maxDuration = 60;

// Trades whose market fetch failed at insert time keep market_id NULL and vanish
// from every category-filtered view. One small chunk per run (the 15-minute poller
// is the schedule) re-links them without an operator having to drive /api/backfill;
// that endpoint remains the bulk tool.
const ORPHAN_REPAIR_LIMIT = 5;
// Repair is a bonus pass inside a 60s function: skip it when the main ingest
// already ate this much of the budget (a slow Polymarket day), because one CLOB
// fetch can burn ~48s worst case (3 attempts x 15s timeout + backoff).
const ORPHAN_REPAIR_START_BUDGET_MS = 10_000;

interface IngestSummary {
	fetched: number;
	new: number;
	skippedBelowThreshold: number;
	insertFailures: number;
	orphansLinked: number;
}

// Excludes condition ids the current run just tried (and failed) to sync —
// retrying them seconds later only re-burns the time budget.
async function repairOrphanedTrades(excludeConditionIds: string[]): Promise<number> {
	const orphans = (await sql`
		SELECT DISTINCT condition_id FROM trades
		WHERE market_id IS NULL
			AND NOT (condition_id = ANY(${excludeConditionIds}))
		LIMIT ${ORPHAN_REPAIR_LIMIT}
	`) as { condition_id: string }[];

	if (orphans.length === 0) return 0;

	const synced = await syncMarketsForConditionIds(orphans.map((o) => o.condition_id));

	let linked = 0;
	for (const [conditionId, marketId] of synced) {
		const rows = (await sql`
			UPDATE trades
			SET market_id = ${marketId}
			WHERE condition_id = ${conditionId} AND market_id IS NULL
			RETURNING id
		`) as { id: string }[];

		linked += rows.length;
	}

	return linked;
}

async function runIngest(): Promise<{ summary: IngestSummary; attemptedConditionIds: string[] }> {
	const summary: IngestSummary = { fetched: 0, new: 0, skippedBelowThreshold: 0, insertFailures: 0, orphansLinked: 0 };

	const trades = await fetchWhaleTrades({ minAmount: WHALE_THRESHOLD_DEFAULT });
	summary.fetched = trades.length;

	if (trades.length === 0) return { summary, attemptedConditionIds: [] };

	const hashes = trades.map((t) => t.transactionHash);
	const existing = (await sql`
		SELECT transaction_hash FROM trades
		WHERE transaction_hash = ANY(${hashes})
	`) as { transaction_hash: string }[];
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

	if (newTrades.length === 0) return { summary, attemptedConditionIds: [] };

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

	return { summary, attemptedConditionIds: uniqueConditionIds };
}

async function handleIngest(): Promise<NextResponse> {
	const startedAt = Date.now();

	try {
		const { summary, attemptedConditionIds } = await runIngest();

		// Self-heal orphans left by earlier runs. A failure here must not fail the
		// ingest that just committed its rows.
		if (Date.now() - startedAt < ORPHAN_REPAIR_START_BUDGET_MS) {
			try {
				summary.orphansLinked = await repairOrphanedTrades(attemptedConditionIds);
			} catch (error) {
				console.error('[ingest] orphan repair failed:', error);
			}
		}

		console.log(
			`[ingest] Done: fetched=${summary.fetched}, new=${summary.new}, skippedBelowThreshold=${summary.skippedBelowThreshold}, insertFailures=${summary.insertFailures}, orphansLinked=${summary.orphansLinked}`,
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
