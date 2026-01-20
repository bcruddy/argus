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
	tags: z.array(tagSchema).optional(),
	active: z.boolean().optional(),
	closed: z.boolean().optional(),
	endDate: z.string().optional(),
	closedTime: z.string().optional(),
	// Event reference - markets may include parent event info
	eventSlug: z.string().optional(),
});

// Schema for Polymarket Gamma API event response (events have tags)
const gammaEventSchema = z.object({
	id: z.string().optional(),
	slug: z.string().optional(),
	title: z.string().optional(),
	description: z.string().optional(),
	tags: z.array(tagSchema).optional(),
	markets: z.array(z.object({
		conditionId: z.string().optional(),
	})).optional(),
});

export type GammaMarket = z.infer<typeof gammaMarketSchema>;
export type GammaEvent = z.infer<typeof gammaEventSchema>;

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

// Fetch event by slug to get tags (tags are on events, not markets)
async function fetchEventBySlug(slug: string): Promise<GammaEvent | null> {
	try {
		const url = new URL('/events', POLYMARKET_GAMMA_API_URL);
		url.searchParams.set('slug', slug);

		const response = await fetch(url.toString(), {
			headers: {
				Accept: 'application/json',
			},
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		if (!Array.isArray(data) || data.length === 0) {
			return null;
		}

		const parsed = gammaEventSchema.safeParse(data[0]);
		if (!parsed.success) {
			return null;
		}

		return parsed.data;
	} catch {
		return null;
	}
}

// Fetch event that contains the given condition ID
async function fetchEventByConditionId(conditionId: string): Promise<GammaEvent | null> {
	try {
		// Query events endpoint with condition_id to find parent event
		const url = new URL('/events', POLYMARKET_GAMMA_API_URL);
		url.searchParams.set('condition_id', conditionId);

		const response = await fetch(url.toString(), {
			headers: {
				Accept: 'application/json',
			},
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		if (!Array.isArray(data) || data.length === 0) {
			return null;
		}

		const parsed = gammaEventSchema.safeParse(data[0]);
		if (!parsed.success) {
			return null;
		}

		return parsed.data;
	} catch {
		return null;
	}
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

		const market = parsed.data;

		// If market doesn't have tags, try to get them from the parent event
		if (!market.tags || market.tags.length === 0) {
			// First try fetching event by condition_id
			let event = await fetchEventByConditionId(conditionId);

			// Fallback: try fetching event by slug if market has eventSlug
			if (!event && market.eventSlug) {
				event = await fetchEventBySlug(market.eventSlug);
			}

			// Copy tags from event to market
			if (event?.tags && event.tags.length > 0) {
				market.tags = event.tags;
			}
		}

		return market;
	} catch (error) {
		console.error('Error fetching market from Gamma API:', error);
		return null;
	}
}
