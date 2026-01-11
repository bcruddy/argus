import { z } from 'zod';
import { polymarketTradeSchema, type PolymarketTrade } from '@/schemas/trade';
import { POLYMARKET_DATA_API_URL, WHALE_THRESHOLD_DEFAULT } from './constants';

const tradesResponseSchema = z.array(polymarketTradeSchema);

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
