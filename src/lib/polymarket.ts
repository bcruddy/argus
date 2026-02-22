import { z } from 'zod';
import { POLYMARKET_GAMMA_API_URL } from './constants';

// Schema for tag objects used in Gamma API responses
const gammaTagSchema = z.object({
	id: z.string().optional(),
	label: z.string().optional(),
	slug: z.string().optional(),
});

// Schema for nested event objects in Gamma API market responses
const gammaEventSchema = z.object({
	tags: z.array(gammaTagSchema).optional(),
}).passthrough();

// Schema for Polymarket Gamma API market response
// Tags live on events, not directly on markets. The market response includes
// an event_slug field that links to the parent event where tags are defined.
const gammaMarketSchema = z.object({
	conditionId: z.string(),
	slug: z.string().optional(),
	event_slug: z.string().optional(),
	question: z.string().optional(),
	description: z.string().optional(),
	image: z.string().optional(),
	tags: z.array(gammaTagSchema).optional(),
	events: z.array(gammaEventSchema).optional(),
	active: z.boolean().optional(),
	closed: z.boolean().optional(),
	endDate: z.string().optional(),
	closedTime: z.string().optional(),
}).passthrough();

export type GammaMarket = z.infer<typeof gammaMarketSchema>;

/** Get the event slug from a market response, checking both naming conventions */
export function getEventSlug(market: GammaMarket): string | undefined {
	// The Gamma API may return the field as event_slug or eventSlug
	// .passthrough() preserves extra fields, so check both
	const raw = market as Record<string, unknown>;
	return market.event_slug || (raw.eventSlug as string | undefined) || undefined;
}

// Generic tags that don't provide useful categorization
const GENERIC_TAGS = new Set(['All']);

/** Extract tag labels from a Gamma market, checking nested events as fallback.
 *  Filters out generic tags like "All" that don't help with categorization. */
export function extractMarketTags(market: GammaMarket): string[] {
	// Try direct market tags first
	const directTags = market.tags
		?.map((t) => t.label)
		.filter((label): label is string => typeof label === 'string' && label.length > 0)
		.filter((label) => !GENERIC_TAGS.has(label));
	if (directTags && directTags.length > 0) return directTags;

	// Fall back to tags from nested events
	const eventTags = market.events
		?.flatMap((e) => e.tags ?? [])
		.map((t) => t.label)
		.filter((label): label is string => typeof label === 'string' && label.length > 0)
		.filter((label) => !GENERIC_TAGS.has(label));
	if (eventTags && eventTags.length > 0) return [...new Set(eventTags)];

	return [];
}

export function calculateUsdValue(size: number, price: number): number {
	return size * price;
}

export async function fetchMarketByConditionId(conditionId: string): Promise<GammaMarket | null> {
	try {
		const url = new URL('/markets', POLYMARKET_GAMMA_API_URL);
		url.searchParams.set('condition_id', conditionId);

		const response = await fetch(url.toString(), {
			headers: {
				Accept: 'application/json',
			},
		});

		if (!response.ok) {
			console.error(`Gamma API error: ${response.status} ${response.statusText}`);
			return null;
		}

		const data = await response.json();

		// Gamma API returns an array of markets for the condition
		if (!Array.isArray(data) || data.length === 0) {
			return null;
		}

		const parsed = gammaMarketSchema.safeParse(data[0]);
		if (!parsed.success) {
			console.error('Failed to parse market data:', parsed.error.flatten());
			return null;
		}

		return parsed.data;
	} catch (error) {
		console.error('Error fetching market from Gamma API:', error);
		return null;
	}
}

/**
 * Fetch tags for a market by looking up its parent event via event_slug.
 * Tags live on events, not markets. The /events/slug/{slug} endpoint
 * returns the event with its tags array.
 */
export async function fetchEventTagsBySlug(eventSlug: string): Promise<string[]> {
	try {
		// Use the path-based endpoint: /events/slug/{event_slug}
		const url = `${POLYMARKET_GAMMA_API_URL}/events/slug/${encodeURIComponent(eventSlug)}`;

		const response = await fetch(url, {
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			// Fallback: try query-based endpoint /events?slug={slug}
			const fallbackUrl = new URL('/events', POLYMARKET_GAMMA_API_URL);
			fallbackUrl.searchParams.set('slug', eventSlug);
			const fallbackResponse = await fetch(fallbackUrl.toString(), {
				headers: { Accept: 'application/json' },
			});
			if (!fallbackResponse.ok) return [];
			const fallbackData = await fallbackResponse.json();
			const event = Array.isArray(fallbackData) ? fallbackData[0] : fallbackData;
			const tags = event?.tags;
			if (!Array.isArray(tags)) return [];
			return tags
				.map((t: { label?: string }) => t.label)
				.filter(Boolean) as string[];
		}

		// /events/slug/{slug} returns a single event object (not an array)
		const event = await response.json();
		const tags = event?.tags;
		if (!Array.isArray(tags)) return [];

		return tags
			.map((t: { label?: string }) => t.label)
			.filter(Boolean) as string[];
	} catch {
		return [];
	}
}
