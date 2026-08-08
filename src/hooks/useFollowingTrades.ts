'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { followingTradesQueryKey, infiniteFollowingTradesQueryKey } from '@/lib/queryKeys';
import type { TradesFilters } from './useTradesFilters';
import { fetchTrades, nextOffset } from './useTrades';
import { fetchGroupedTrades, type GroupedTradesFilters } from './useGroupedTrades';

// Thin bindings of the scope-parameterized fetchers (useTrades/useGroupedTrades) to
// the following-feed query keys. The 401-aware retry policy is a query-client
// default (src/lib/queryClient.ts), so these hooks carry no override.
export function useFollowingTrades(filters: TradesFilters, limit: number = 50, enabled: boolean = true) {
	return useQuery({
		queryKey: followingTradesQueryKey(filters, limit),
		queryFn: () => fetchTrades('following', filters, limit),
		enabled,
	});
}

export function useInfiniteFollowingTrades(filters: TradesFilters, pageSize: number = 20, enabled: boolean = true) {
	return useInfiniteQuery({
		queryKey: infiniteFollowingTradesQueryKey(filters, pageSize),
		queryFn: ({ pageParam = 0 }) => fetchTrades('following', filters, pageSize, pageParam),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => nextOffset(lastPage, pageSize),
		enabled,
	});
}

export function useGroupedFollowingTrades(
	filters: TradesFilters,
	timeWindowHours: number,
	limit: number = 50,
	enabled: boolean = true,
) {
	const groupedFilters: GroupedTradesFilters = {
		category: filters.category,
		event: filters.event,
		minAmount: filters.minAmount,
		timeWindowHours,
	};

	return useQuery({
		queryKey: ['groupedFollowingTrades', groupedFilters, limit],
		queryFn: () => fetchGroupedTrades('following', groupedFilters, limit),
		enabled,
	});
}
