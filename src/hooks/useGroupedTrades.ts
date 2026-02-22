'use client';

import { useQuery } from '@tanstack/react-query';
import type { TradesFilters } from './useTradesFilters';
import type { TradeGroup, GroupedTradesResponse } from '@/schemas/api';

export type { TradeGroup, GroupedTradesResponse };

export interface GroupedTradesFilters {
	categories: string | null;
	event: string | null;
	minAmount: number;
	timeWindowHours: number;
}

async function fetchGroupedTrades(
	filters: GroupedTradesFilters,
	limit: number,
): Promise<GroupedTradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	params.set('timeWindowHours', String(filters.timeWindowHours));
	if (filters.categories) params.set('categories', filters.categories);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades/grouped?${params}`);
	if (!res.ok) throw new Error('Failed to fetch grouped trades');
	return res.json();
}

export function useGroupedTrades(filters: TradesFilters, timeWindowHours: number, limit: number = 50) {
	const groupedFilters: GroupedTradesFilters = {
		categories: filters.categories,
		event: filters.event,
		minAmount: filters.minAmount,
		timeWindowHours,
	};

	return useQuery({
		queryKey: ['groupedTrades', groupedFilters, limit],
		queryFn: () => fetchGroupedTrades(groupedFilters, limit),
	});
}
