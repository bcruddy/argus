import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchMarketByConditionId } from '@/lib/polymarket';

export async function POST() {
	try {
		// Re-fetch ALL markets — existing tags from gamma API are wrong
		const marketsToBackfill = (await sql`
			SELECT condition_id FROM markets
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
			await new Promise(r => setTimeout(r, 100));
		}

		return NextResponse.json({
			total: marketsToBackfill.length,
			updated,
			noTags,
			failed,
		});
	} catch (error) {
		console.error('[backfill] error:', error);
		return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
	}
}
