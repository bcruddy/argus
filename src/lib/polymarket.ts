import { z } from 'zod';
import { polymarketTradeSchema, type PolymarketTrade } from '@/schemas/trade';
import { POLYMARKET_DATA_API_URL, POLYMARKET_CLOB_API_URL, WHALE_THRESHOLD_DEFAULT } from './constants';

const tradesResponseSchema = z.array(polymarketTradeSchema);

// Schema for Polymarket CLOB API market response
const clobMarketSchema = z
	.object({
		condition_id: z.string(),
		market_slug: z.string().optional(),
		question: z.string().optional(),
		description: z.string().optional(),
		icon: z.string().optional(),
		tags: z.array(z.string()).default([]),
		active: z.boolean().optional(),
		closed: z.boolean().optional(),
		end_date_iso: z.string().optional(),
	})
	.passthrough();

export type ClobMarket = z.infer<typeof clobMarketSchema>;

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15000;

// Tagged so the catch below can tell "the server said no and will keep saying
// no" (404 on a resolved market) apart from a transport failure worth retrying.
class NonRetryableHttpError extends Error {}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(url, {
				...init,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (response.ok) return response;

			const message = `Polymarket API error: ${response.status} ${response.statusText}`;
			if (!RETRYABLE_STATUSES.has(response.status)) throw new NonRetryableHttpError(message);
			if (attempt === MAX_ATTEMPTS - 1) throw new Error(message);

			await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
		} catch (error) {
			if (error instanceof NonRetryableHttpError || attempt === MAX_ATTEMPTS - 1) throw error;
			await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
		}
	}
	throw new Error('fetchWithRetry: exhausted attempts');
}

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

	const response = await fetchWithRetry(url.toString(), {
		headers: {
			Accept: 'application/json',
		},
	});

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

export async function fetchMarketByConditionId(conditionId: string): Promise<ClobMarket | null> {
	try {
		const url = `${POLYMARKET_CLOB_API_URL}/markets/${encodeURIComponent(conditionId)}`;

		const response = await fetchWithRetry(url, {
			headers: {
				Accept: 'application/json',
			},
		});

		const data = await response.json();

		const parsed = clobMarketSchema.safeParse(data);
		if (!parsed.success) {
			console.error('Failed to parse market data:', parsed.error.flatten());
			return null;
		}

		return parsed.data;
	} catch (error) {
		console.error('Error fetching market from CLOB API:', error);
		return null;
	}
}
