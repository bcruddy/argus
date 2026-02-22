import { z } from 'zod';
import { polymarketTradeSchema, type PolymarketTrade } from '@/schemas/trade';
import { POLYMARKET_DATA_API_URL, POLYMARKET_GAMMA_API_URL, WHALE_THRESHOLD_DEFAULT } from './constants';

const tradesResponseSchema = z.array(polymarketTradeSchema);

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
// Tags live on events nested inside markets, not directly on the market
const gammaMarketSchema = z.object({
	conditionId: z.string(),
	slug: z.string().optional(),
	question: z.string().optional(),
	description: z.string().optional(),
	image: z.string().optional(),
	tags: z.array(gammaTagSchema).optional(),
	events: z.array(gammaEventSchema).optional(),
	active: z.boolean().optional(),
	closed: z.boolean().optional(),
	endDate: z.string().optional(),
	closedTime: z.string().optional(),
});

export type GammaMarket = z.infer<typeof gammaMarketSchema>;

/** Extract tag labels from a Gamma market, checking nested events as fallback */
export function extractMarketTags(market: GammaMarket): string[] {
	// Try direct market tags first
	const directTags = market.tags?.map((t) => t.label).filter(Boolean) as string[] | undefined;
	if (directTags && directTags.length > 0) return directTags;

	// Fall back to tags from nested events
	const eventTags = market.events
		?.flatMap((e) => e.tags ?? [])
		.map((t) => t.label)
		.filter(Boolean) as string[] | undefined;
	if (eventTags && eventTags.length > 0) return [...new Set(eventTags)];

	return [];
}

export interface FetchWhaleTradesOptions {
	minAmount?: number;
	limit?: number;
	offset?: number;
}

export async function fetchWhaleTrades(options: FetchWhaleTradesOptions = {}): Promise<PolymarketTrade[]> {
	const { minAmount = WHALE_THRESHOLD_DEFAULT, limit = 100, offset } = options;

	const url = new URL('/trades', POLYMARKET_DATA_API_URL);
	url.searchParams.set('filterType', 'CASH');
	url.searchParams.set('filterAmount', String(minAmount));
	url.searchParams.set('limit', String(limit));
	if (offset !== undefined && offset > 0) {
		url.searchParams.set('offset', String(offset));
	}

	const response = await fetch(url.toString(), {
		headers: {
			Accept: 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	const parsed = tradesResponseSchema.safeParse(data);

	if (!parsed.success) {
		console.error('Failed to parse Polymarket trades:', parsed.error.flatten());
		throw new Error('Invalid response from Polymarket API');
	}

	return parsed.data;
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
 * Fetch tags for a market by looking up its parent event via slug.
 * The /events endpoint reliably returns tags, unlike /markets which
 * may not include them.
 */
export async function fetchEventTagsBySlug(slug: string): Promise<string[]> {
	try {
		const url = new URL('/events', POLYMARKET_GAMMA_API_URL);
		url.searchParams.set('slug', slug);

		const response = await fetch(url.toString(), {
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) return [];

		const data = await response.json();
		if (!Array.isArray(data) || data.length === 0) return [];

		const event = data[0];
		const tags = event?.tags;
		if (!Array.isArray(tags)) return [];

		return tags
			.map((t: { label?: string }) => t.label)
			.filter(Boolean) as string[];
	} catch {
		return [];
	}
}
