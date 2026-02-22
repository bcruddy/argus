import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchMarketByConditionId, extractMarketTags, fetchEventTagsBySlug, getEventSlug } from '@/lib/polymarket';
import { POLYMARKET_GAMMA_API_URL } from '@/lib/constants';

export async function GET(request: NextRequest) {
	try {
		const conditionId = new URL(request.url).searchParams.get('probe');

		// If ?probe=<condition_id> is provided, do a live API diagnostic
		if (conditionId) {
			return probeConditionId(conditionId);
		}

		// Default: show DB tag stats
		return showTagStats();
	} catch (error) {
		console.error('Debug tags error:', error);
		return NextResponse.json({ error: 'Failed to fetch debug info' }, { status: 500 });
	}
}

async function probeConditionId(conditionId: string) {
	const steps: Record<string, unknown> = { conditionId };

	// Step 1: Fetch raw market response from Gamma API
	try {
		const url = new URL('/markets', POLYMARKET_GAMMA_API_URL);
		url.searchParams.set('condition_id', conditionId);
		const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
		const rawData = await response.json();
		const market = Array.isArray(rawData) ? rawData[0] : rawData;

		// Show key fields from the raw response
		steps.rawMarketKeys = market ? Object.keys(market) : null;
		steps.rawMarketTags = market?.tags ?? null;
		steps.rawMarketEvents = market?.events ?? null;
		steps.rawEventSlug = market?.event_slug ?? null;
		steps.rawEventSlugCamel = market?.eventSlug ?? null;
		steps.rawSlug = market?.slug ?? null;
	} catch (error) {
		steps.rawMarketError = String(error);
	}

	// Step 2: Parse through our schema
	try {
		const parsed = await fetchMarketByConditionId(conditionId);
		if (parsed) {
			steps.parsedEventSlug = getEventSlug(parsed);
			steps.parsedExtractedTags = extractMarketTags(parsed);
			steps.parsedSlug = parsed.slug;
			steps.parsedRawTags = parsed.tags;
			steps.parsedRawEvents = parsed.events;
		} else {
			steps.parsedMarket = null;
		}
	} catch (error) {
		steps.parseError = String(error);
	}

	// Step 3: Try events endpoint with event_slug (if found)
	const eventSlug = steps.rawEventSlug || steps.rawEventSlugCamel || steps.parsedEventSlug;
	if (eventSlug) {
		try {
			const eventTags = await fetchEventTagsBySlug(eventSlug as string);
			steps.eventEndpointSlug = eventSlug;
			steps.eventEndpointTags = eventTags;
		} catch (error) {
			steps.eventEndpointError = String(error);
		}
	} else {
		steps.eventEndpointSkipped = 'No event_slug found on market response';
	}

	// Step 4: Also try fetching events by market slug to see what happens
	const marketSlug = steps.rawSlug as string | null;
	if (marketSlug && marketSlug !== eventSlug) {
		try {
			const marketSlugTags = await fetchEventTagsBySlug(marketSlug);
			steps.marketSlugEventTags = marketSlugTags;
		} catch (error) {
			steps.marketSlugEventError = String(error);
		}
	}

	// Step 5: Check what's in the DB for this condition_id
	const dbMarket = await sql`
		SELECT id, condition_id, slug, question, tags, last_synced_at
		FROM markets WHERE condition_id = ${conditionId}
	`;
	steps.dbMarket = dbMarket[0] ?? null;

	return NextResponse.json(steps);
}

async function showTagStats() {
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
}
