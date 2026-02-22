import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
	try {
		// Show tag distribution across all markets
		const tagStats = await sql`
			SELECT
				jsonb_array_elements_text(tags) as tag,
				COUNT(*) as market_count
			FROM markets
			WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
			GROUP BY tag
			ORDER BY market_count DESC
		`;

		// Count markets with/without tags
		const counts = await sql`
			SELECT
				COUNT(*) FILTER (WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0) as with_tags,
				COUNT(*) FILTER (WHERE tags IS NULL OR jsonb_array_length(tags) = 0) as without_tags,
				COUNT(*) as total
			FROM markets
		`;

		// Sample markets without tags (to see what's missing)
		const missingTags = await sql`
			SELECT condition_id, slug, question,
				tags, last_synced_at
			FROM markets
			WHERE tags IS NULL OR jsonb_array_length(tags) = 0
			ORDER BY last_synced_at DESC NULLS LAST
			LIMIT 10
		`;

		// Sample markets WITH tags (to see what's working)
		const withTags = await sql`
			SELECT condition_id, slug, question, tags
			FROM markets
			WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
			LIMIT 5
		`;

		// Test the ?| operator with doomscroll categories to verify SQL filtering works
		const filterTest = await sql`
			SELECT COUNT(*) as matching_markets
			FROM markets
			WHERE tags ?| ARRAY['Geopolitics', 'Politics', 'Iran', 'Israel']
		`;

		// Check JSONB type of tags column for a few markets
		const typeCheck = await sql`
			SELECT condition_id, jsonb_typeof(tags) as tag_type,
				tags::text as raw_tags
			FROM markets
			WHERE tags IS NOT NULL
			LIMIT 5
		`;

		return NextResponse.json({
			tagDistribution: tagStats,
			counts: counts[0],
			sampleMissingTags: missingTags,
			sampleWithTags: withTags,
			filterTest: filterTest[0],
			typeCheck,
		});
	} catch (error) {
		console.error('Debug tags error:', error);
		return NextResponse.json({ error: 'Failed to fetch debug info' }, { status: 500 });
	}
}
