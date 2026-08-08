'use client';

import { useQuery } from '@tanstack/react-query';
import { groupedTradesResponseSchema } from '@/schemas/api';
import { fetchJson } from '@/lib/fetchJson';
import type { TradesFilters } from './useTradesFilters';
import type { TradesScope } from './useTrades';
import type { TradeGroup, GroupedTradesResponse } from '@/schemas/api';

export type { TradeGroup, GroupedTradesResponse };

export interface GroupedTradesFilters {
	category: string | null;
	event: string | null;
	minAmount: number;
	timeWindowHours: number;
}

const GROUPED_ENDPOINT: Record<TradesScope, string> = {
	all: '/api/trades/grouped',
	following: '/api/trades/following/grouped',
};

export function fetchGroupedTrades(
	scope: TradesScope,
	filters: GroupedTradesFilters,
	limit: number,
): Promise<GroupedTradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	params.set('timeWindowHours', String(filters.timeWindowHours));
	if (filters.category) params.set('category', filters.category);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	return fetchJson(GROUPED_ENDPOINT[scope], groupedTradesResponseSchema, 'grouped trades', params);
}

export function useGroupedTrades(
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
		queryKey: ['groupedTrades', groupedFilters, limit],
		queryFn: () => fetchGroupedTrades('all', groupedFilters, limit),
		enabled,
	});
}
