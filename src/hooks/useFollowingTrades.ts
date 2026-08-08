'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
	MAX_TRADES_OFFSET,
	groupedTradesResponseSchema,
	parseResponse,
	tradesResponseSchema,
	type GroupedTradesResponse,
} from '@/schemas/api';
import { followingTradesQueryKey, infiniteFollowingTradesQueryKey } from '@/lib/queryKeys';
import type { TradesFilters } from './useTradesFilters';
import type { Trade } from './useTrades';

// Extended Trade type with wallet label
export interface FollowingTrade extends Trade {
	wallet_label: string | null;
}

export interface FollowingTradesResponse {
	trades: FollowingTrade[];
	hasMore: boolean;
	offset: number;
}

async function fetchFollowingTrades(
	filters: TradesFilters,
	limit: number,
	offset: number = 0,
): Promise<FollowingTradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	params.set('offset', String(offset));
	if (filters.sort !== 'time') params.set('sort', filters.sort);
	if (filters.order !== 'desc') params.set('order', filters.order);
	if (filters.category) params.set('category', filters.category);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades/following?${params}`);
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized');
		throw new Error('Failed to fetch following trades');
	}
	return parseResponse(tradesResponseSchema, await res.json(), '/api/trades/following');
}

// The 401-aware retry policy is a query-client default now (src/lib/queryClient.ts),
// so these hooks carry no override.
export function useFollowingTrades(filters: TradesFilters, limit: number = 50, enabled: boolean = true) {
	return useQuery({
		queryKey: followingTradesQueryKey(filters, limit),
		queryFn: () => fetchFollowingTrades(filters, limit),
		enabled,
	});
}

export function useInfiniteFollowingTrades(filters: TradesFilters, pageSize: number = 20, enabled: boolean = true) {
	return useInfiniteQuery({
		queryKey: infiniteFollowingTradesQueryKey(filters, pageSize),
		queryFn: ({ pageParam = 0 }) => fetchFollowingTrades(filters, pageSize, pageParam),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => {
			if (!lastPage.hasMore) return undefined;
			const nextOffset = lastPage.offset + pageSize;
			// Same offset cap as /api/trades — see useInfiniteTrades.
			if (nextOffset > MAX_TRADES_OFFSET) return undefined;
			return nextOffset;
		},
		enabled,
	});
}

// Grouped following trades
interface GroupedFollowingFilters {
	category: string | null;
	event: string | null;
	minAmount: number;
	timeWindowHours: number;
}

async function fetchGroupedFollowingTrades(
	filters: GroupedFollowingFilters,
	limit: number,
): Promise<GroupedTradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	params.set('timeWindowHours', String(filters.timeWindowHours));
	if (filters.category) params.set('category', filters.category);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades/following/grouped?${params}`);
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized');
		throw new Error('Failed to fetch grouped following trades');
	}
	return parseResponse(groupedTradesResponseSchema, await res.json(), '/api/trades/following/grouped');
}

export function useGroupedFollowingTrades(
	filters: TradesFilters,
	timeWindowHours: number,
	limit: number = 50,
	enabled: boolean = true,
) {
	const groupedFilters: GroupedFollowingFilters = {
		category: filters.category,
		event: filters.event,
		minAmount: filters.minAmount,
		timeWindowHours,
	};

	return useQuery({
		queryKey: ['groupedFollowingTrades', groupedFilters, limit],
		queryFn: () => fetchGroupedFollowingTrades(groupedFilters, limit),
		enabled,
	});
}
