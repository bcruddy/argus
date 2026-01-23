import { z } from 'zod';
import { polymarketTradeSchema, type PolymarketTrade } from '@/schemas/trade';
import { POLYMARKET_DATA_API_URL, POLYMARKET_GAMMA_API_URL, WHALE_THRESHOLD_DEFAULT } from './constants';

const tradesResponseSchema = z.array(polymarketTradeSchema);

// Schema for tag objects (shared between markets and events)
const tagSchema = z.object({
	id: z.string().optional(),
	label: z.string().optional(),
	slug: z.string().optional(),
});

// Schema for Polymarket Gamma API market response
const gammaMarketSchema = z.object({
	conditionId: z.string(),
	slug: z.string().optional(),
	question: z.string().optional(),
	description: z.string().optional(),
	image: z.string().optional(),
	active: z.boolean().optional(),
	closed: z.boolean().optional(),
	endDate: z.string().optional(),
	closedTime: z.string().optional(),
}).passthrough();

// Schema for event's nested market (minimal, just need conditionId)
const eventMarketSchema = z.object({
	conditionId: z.string().optional(),
}).passthrough();

// Schema for Polymarket Gamma API event response (events have tags)
const gammaEventSchema = z.object({
	id: z.string().optional(),
	slug: z.string().optional(),
	title: z.string().optional(),
	tags: z.array(tagSchema).optional(),
	markets: z.array(eventMarketSchema).optional(),
}).passthrough();

export type GammaMarket = z.infer<typeof gammaMarketSchema>;

export interface FetchWhaleTradesOptions {
	minAmount?: number;
	limit?: number;
}

export async function fetchWhaleTrades(options: FetchWhaleTradesOptions = {}): Promise<PolymarketTrade[]> {
	const { minAmount = WHALE_THRESHOLD_DEFAULT, limit = 100 } = options;

	const url = new URL('/trades', POLYMARKET_DATA_API_URL);
	url.searchParams.set('filterType', 'CASH');
	url.searchParams.set('filterAmount', String(minAmount));
	url.searchParams.set('limit', String(limit));

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
 * Fetches events from the Gamma API and builds a map of conditionId -> tag labels.
 * Tags live on events, not markets. Each event contains a nested markets array
 * with condition IDs that we can match to our stored markets.
 */
export async function fetchEventTagsForConditionIds(
	conditionIds: string[]
): Promise<Map<string, string[]>> {
	const conditionToTags = new Map<string, string[]>();
	if (conditionIds.length === 0) return conditionToTags;

	const targetIds = new Set(conditionIds);
	const foundIds = new Set<string>();

	try {
		// Fetch events in pages until we've matched all condition IDs or exhausted results
		const PAGE_SIZE = 50;
		const MAX_PAGES = 10;

		for (let page = 0; page < MAX_PAGES; page++) {
			if (foundIds.size >= targetIds.size) break;

			const url = new URL('/events', POLYMARKET_GAMMA_API_URL);
			url.searchParams.set('limit', String(PAGE_SIZE));
			url.searchParams.set('offset', String(page * PAGE_SIZE));
			url.searchParams.set('order', 'id');
			url.searchParams.set('ascending', 'false');

			const response = await fetch(url.toString(), {
				headers: { Accept: 'application/json' },
			});

			if (!response.ok) break;

			const data = await response.json();
			if (!Array.isArray(data) || data.length === 0) break;

			for (const rawEvent of data) {
				const parsed = gammaEventSchema.safeParse(rawEvent);
				if (!parsed.success) continue;

				const event = parsed.data;
				if (!event.tags || event.tags.length === 0 || !event.markets) continue;

				const tagLabels = event.tags
					.map((t) => t.label)
					.filter((l): l is string => Boolean(l));
				if (tagLabels.length === 0) continue;

				// Check if any of this event's markets match our target condition IDs
				for (const market of event.markets) {
					if (market.conditionId && targetIds.has(market.conditionId)) {
						conditionToTags.set(market.conditionId, tagLabels);
						foundIds.add(market.conditionId);
					}
				}
			}

			// If this page had fewer results than PAGE_SIZE, we've reached the end
			if (data.length < PAGE_SIZE) break;
		}
	} catch (error) {
		console.error('Error fetching event tags:', error);
	}

	return conditionToTags;
}
