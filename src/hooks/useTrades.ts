'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { MAX_TRADES_OFFSET, tradesResponseSchema } from '@/schemas/api';
import { fetchJson } from '@/lib/fetchJson';
import { infiniteTradesQueryKey, tradesQueryKey } from '@/lib/queryKeys';
import type { TradesFilters } from './useTradesFilters';

// Which feed a fetch targets. The all/following endpoint pairs differ only in row
// scope, so the fetchers take this parameter instead of existing twice.
export type TradesScope = 'all' | 'following';

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
	// Non-null when the viewer follows the wallet. Both endpoints resolve it: the
	// label join is keyed on the viewer, independent of the feed's row scope.
	wallet_label: string | null;
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

const TRADES_ENDPOINT: Record<TradesScope, string> = {
	all: '/api/trades',
	following: '/api/trades/following',
};

export function fetchTrades(
	scope: TradesScope,
	filters: TradesFilters,
	limit: number,
	offset: number = 0,
): Promise<TradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	params.set('offset', String(offset));
	if (filters.sort !== 'time') params.set('sort', filters.sort);
	if (filters.order !== 'desc') params.set('order', filters.order);
	if (filters.category) params.set('category', filters.category);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	return fetchJson(TRADES_ENDPOINT[scope], tradesResponseSchema, 'trades', params);
}

export function useTrades(filters: TradesFilters, limit: number = 50, enabled: boolean = true) {
	return useQuery({
		queryKey: tradesQueryKey(filters, limit),
		queryFn: () => fetchTrades('all', filters, limit),
		enabled,
	});
}

export function useInfiniteTrades(filters: TradesFilters, pageSize: number = 20, enabled: boolean = true) {
	return useInfiniteQuery({
		queryKey: infiniteTradesQueryKey(filters, pageSize),
		queryFn: ({ pageParam = 0 }) => fetchTrades('all', filters, pageSize, pageParam),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => nextOffset(lastPage, pageSize),
		enabled,
	});
}
