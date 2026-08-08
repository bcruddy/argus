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

// One market fetch can legitimately burn ~48s (3 attempts x 15s timeout plus
// backoff), so wall-clock budgets — not the page size — decide when an invocation
// stops. Without them, a page with two slow condition_ids blew maxDuration, the
// caller got a 504 with no nextCursor, and every retry re-walked the same page
// forever. The checks run between markets, so a single pathological fetch can
// still overrun and get the invocation killed — but the cursor has already
// advanced past everything processed, and reprocessing a partial page is cheap,
// so consecutive calls converge instead of wedging.
const TAG_PHASE_DEADLINE_MS = 25_000;
// Start no trade-linking chunk after this point; the typical chunk is ~1s.
const LINK_PHASE_DEADLINE_MS = 40_000;
// Mirrors the parallelism marketSync uses internally.
const LINK_CHUNK_SIZE = 5;

export async function POST(request: NextRequest) {
	const startedAt = Date.now();

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

		let processed = 0;
		let updated = 0;
		let failed = 0;
		let noTags = 0;
		let lastProcessed: string | null = null;
		let deadlineHit = false;

		for (const market of marketsToBackfill) {
			// Checked after at least one market so the cursor advances every
			// invocation — guaranteed forward progress even on a slow page.
			if (lastProcessed !== null && Date.now() - startedAt > TAG_PHASE_DEADLINE_MS) {
				deadlineHit = true;
				break;
			}

			try {
				const marketData = await fetchMarketByConditionId(market.condition_id);
				if (!marketData || marketData.tags.length === 0) {
					noTags++;
				} else {
					await sql`
						UPDATE markets
						SET tags = ${JSON.stringify(marketData.tags)}::jsonb, last_synced_at = ${new Date()}
						WHERE condition_id = ${market.condition_id}
					`;
					updated++;
				}
			} catch (error) {
				console.error(`[backfill] failed for ${market.condition_id}:`, error);
				failed++;
			}

			processed++;
			lastProcessed = market.condition_id;

			// be polite to polymarket
			await new Promise((r) => setTimeout(r, 100));
		}

		// Deadline hit mid-page: resume from the last processed market, not the
		// page end. Otherwise a short page means we reached the end of the table.
		const nextCursor = deadlineHit || marketsToBackfill.length === limit ? lastProcessed : null;

		// Second job: link trades that were stored before their market could be
		// fetched. Ingest self-heals a small chunk of these every run; this is the
		// bulk version, and it runs regardless of the cursor. Chunked with a
		// deadline check so a slow tag phase shrinks it instead of blowing
		// maxDuration.
		const tradesWithoutMarket = (await sql`
			SELECT DISTINCT condition_id FROM trades
			WHERE market_id IS NULL
			LIMIT ${MARKET_ID_BACKFILL_LIMIT}
		`) as { condition_id: string }[];

		let tradesLinked = 0;

		for (let i = 0; i < tradesWithoutMarket.length; i += LINK_CHUNK_SIZE) {
			if (Date.now() - startedAt > LINK_PHASE_DEADLINE_MS) {
				deadlineHit = true;
				break;
			}

			const chunk = tradesWithoutMarket.slice(i, i + LINK_CHUNK_SIZE).map((t) => t.condition_id);
			const syncedMarketIds = await syncMarketsForConditionIds(chunk);

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
			processed,
			updated,
			noTags,
			failed,
			nextCursor,
			tradesLinked,
			deadlineHit,
		});
	} catch (error) {
		console.error('[backfill] error:', error);
		return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
	}
}
