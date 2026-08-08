'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { MAX_TRADES_OFFSET, parseResponse, tradesResponseSchema } from '@/schemas/api';
import { infiniteTradesQueryKey, tradesQueryKey } from '@/lib/queryKeys';
import type { TradesFilters } from './useTradesFilters';

export interface Trade {
	id: string;
	transaction_hash: string;
	condition_id: string;
	asset_id: string;
	outcome: string | null;
	proxy_wallet: string;
	side: 'BUY' | 'SELL';
	size: number;
	price: number;
	usdc_value: number;
	trade_timestamp: string;
	is_whale: boolean;
	detection_rule: string | null;
	title: string | null;
	category: string | null;
	created_at: string;
}

export interface TradesResponse {
	trades: Trade[];
	hasMore: boolean;
	offset: number;
}

// getNextPageParam for every offset-paged trades feed. The API rejects offsets past
// MAX_TRADES_OFFSET, so stop at the cap and render end-of-list instead of walking the
// user into a 400. Exported (and unit-tested) because both /api/trades and
// /api/trades/following page this way and the two copies had to agree.
export function nextOffset(lastPage: { hasMore: boolean; offset: number }, pageSize: number): number | undefined {
	if (!lastPage.hasMore) return undefined;
	const next = lastPage.offset + pageSize;
	if (next > MAX_TRADES_OFFSET) return undefined;
	return next;
}

async function fetchTrades(filters: TradesFilters, limit: number, offset: number = 0): Promise<TradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	params.set('offset', String(offset));
	if (filters.sort !== 'time') params.set('sort', filters.sort);
	if (filters.order !== 'desc') params.set('order', filters.order);
	if (filters.category) params.set('category', filters.category);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades?${params}`);
	if (!res.ok) throw new Error('Failed to fetch trades');
	return parseResponse(tradesResponseSchema, await res.json(), '/api/trades');
}

export function useTrades(filters: TradesFilters, limit: number = 50, enabled: boolean = true) {
	return useQuery({
		queryKey: tradesQueryKey(filters, limit),
		queryFn: () => fetchTrades(filters, limit),
		enabled,
	});
}

export function useInfiniteTrades(filters: TradesFilters, pageSize: number = 20, enabled: boolean = true) {
	return useInfiniteQuery({
		queryKey: infiniteTradesQueryKey(filters, pageSize),
		queryFn: ({ pageParam = 0 }) => fetchTrades(filters, pageSize, pageParam),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => nextOffset(lastPage, pageSize),
		enabled,
	});
}
