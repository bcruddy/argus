import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchMarketByConditionId } from '@/lib/polymarket';

export async function POST() {
	try {
		const marketsToBackfill = (await sql`
			SELECT condition_id FROM markets
			WHERE tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0
		`) as { condition_id: string }[];

		let updated = 0;
		let failed = 0;
		let noCategory = 0;

		for (const market of marketsToBackfill) {
			try {
				const marketData = await fetchMarketByConditionId(market.condition_id);
				if (!marketData?.category) {
					noCategory++;
					continue;
				}

				await sql`
					UPDATE markets
					SET tags = ${JSON.stringify([marketData.category])}::jsonb, last_synced_at = ${new Date()}
					WHERE condition_id = ${market.condition_id}
				`;
				updated++;
			} catch (error) {
				console.error(`[backfill] failed for ${market.condition_id}:`, error);
				failed++;
			}
		}

		return NextResponse.json({
			total: marketsToBackfill.length,
			updated,
			noCategory,
			failed,
		});
	} catch (error) {
		console.error('[backfill] error:', error);
		return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
	}
}
