import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchMarketByConditionId } from '@/lib/polymarket';
import { syncMarketsForConditionIds } from '@/lib/marketSync';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { backfillQuerySchema } from '@/schemas/api';

export const maxDuration = 60;

// Trades whose market never got synced. Bounded per call for the same reason
// the tag refresh is: this runs inside a 60s function.
const MARKET_ID_BACKFILL_LIMIT = 50;

export async function POST(request: NextRequest) {
	// Operator endpoint: requires CRON_SECRET, not just a user session. Any
	// signed-up user being able to trigger a full-table external-fetch loop
	// was a HIGH finding in docs/audit-2026-08-07.md.
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = backfillQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Invalid parameters', details: parsed.error.flatten() }, { status: 400 });
	}

	const { limit, cursor } = parsed.data;

	try {
		// Keyset page over condition_id so the caller can resume where the last
		// call stopped. The empty string sorts before every real condition_id, so
		// a missing cursor starts from the beginning without a second query.
		const marketsToBackfill = (await sql`
			SELECT condition_id FROM markets
			WHERE condition_id > ${cursor ?? ''}
			ORDER BY condition_id
			LIMIT ${limit}
		`) as { condition_id: string }[];

		let updated = 0;
		let failed = 0;
		let noTags = 0;

		for (const market of marketsToBackfill) {
			try {
				const marketData = await fetchMarketByConditionId(market.condition_id);
				if (!marketData || marketData.tags.length === 0) {
					noTags++;
					continue;
				}

				await sql`
					UPDATE markets
					SET tags = ${JSON.stringify(marketData.tags)}::jsonb, last_synced_at = ${new Date()}
					WHERE condition_id = ${market.condition_id}
				`;
				updated++;
			} catch (error) {
				console.error(`[backfill] failed for ${market.condition_id}:`, error);
				failed++;
			}

			// be polite to polymarket
			await new Promise((r) => setTimeout(r, 100));
		}

		// A short page means we reached the end of the table.
		const nextCursor = marketsToBackfill.length === limit ? (marketsToBackfill.at(-1)?.condition_id ?? null) : null;

		// Second job, moved out of /api/ingest: link trades that were stored
		// before their market could be fetched.
		const tradesWithoutMarket = (await sql`
			SELECT DISTINCT condition_id FROM trades
			WHERE market_id IS NULL
			LIMIT ${MARKET_ID_BACKFILL_LIMIT}
		`) as { condition_id: string }[];

		let tradesLinked = 0;

		if (tradesWithoutMarket.length > 0) {
			const syncedMarketIds = await syncMarketsForConditionIds(tradesWithoutMarket.map((t) => t.condition_id));

			for (const [conditionId, marketId] of syncedMarketIds) {
				const linked = (await sql`
					UPDATE trades
					SET market_id = ${marketId}
					WHERE condition_id = ${conditionId} AND market_id IS NULL
					RETURNING id
				`) as { id: string }[];

				tradesLinked += linked.length;
			}
		}

		return NextResponse.json({
			processed: marketsToBackfill.length,
			updated,
			noTags,
			failed,
			nextCursor,
			tradesLinked,
		});
	} catch (error) {
		console.error('[backfill] error:', error);
		return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
	}
}
