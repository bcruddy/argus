import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
	try {
		// Get distinct categories from markets table
		const categoriesResult = await sql`
			SELECT DISTINCT jsonb_array_elements_text(tags) as category
			FROM markets
			WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
			ORDER BY category
		`;

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
			categories: categoriesResult.map((r: { category: string }) => r.category),
			events: eventsResult.map((r: { event: string }) => r.event).filter(Boolean),
		});
	} catch (error) {
		console.error('Failed to fetch filters:', error);
		return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 });
	}
}
