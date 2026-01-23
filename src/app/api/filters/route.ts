import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
	try {
		// Debug: check what's in the markets table
		const marketCount = await sql`SELECT COUNT(*) as count FROM markets`;
		const marketsWithTags = await sql`
			SELECT COUNT(*) as count FROM markets
			WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
		`;
		const sampleTags = await sql`
			SELECT condition_id, tags, jsonb_typeof(tags) as tag_type
			FROM markets
			WHERE tags IS NOT NULL
			LIMIT 5
		`;
		console.log('[filters] Total markets:', marketCount[0]?.count);
		console.log('[filters] Markets with non-empty tags:', marketsWithTags[0]?.count);
		console.log('[filters] Sample tags:', JSON.stringify(sampleTags, null, 2));

		// Get distinct categories from markets table
		const categoriesResult = await sql`
			SELECT DISTINCT jsonb_array_elements_text(tags) as category
			FROM markets
			WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
			ORDER BY category
		`;

		console.log('[filters] Categories found:', JSON.stringify(categoriesResult));

		// Get distinct events (market questions) that have whale trades
		const eventsResult = await sql`
			SELECT DISTINCT COALESCE(t.title, m.question) as event
			FROM trades t
			LEFT JOIN markets m ON t.market_id = m.id
			WHERE t.is_whale = true
				AND (t.title IS NOT NULL OR m.question IS NOT NULL)
			ORDER BY event
			LIMIT 100
		`;

		return NextResponse.json({
			categories: (categoriesResult as { category: string }[]).map((r) => r.category),
			events: (eventsResult as { event: string }[]).map((r) => r.event).filter(Boolean),
		});
	} catch (error) {
		console.error('Failed to fetch filters:', error);
		return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 });
	}
}
