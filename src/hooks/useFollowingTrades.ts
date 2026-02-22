'use client';

import { useQuery } from '@tanstack/react-query';
import type { TradesFilters } from './useTradesFilters';
import type { Trade } from './useTrades';
import type { GroupedTradesResponse } from '@/schemas/api';

// Extended Trade type with wallet label
export interface FollowingTrade extends Trade {
	wallet_label: string | null;
}

export interface FollowingTradesResponse {
	trades: FollowingTrade[];
}

async function fetchFollowingTrades(filters: TradesFilters, limit: number): Promise<FollowingTradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	if (filters.sort !== 'time') params.set('sort', filters.sort);
	if (filters.order !== 'desc') params.set('order', filters.order);
	if (filters.categories) params.set('categories', filters.categories);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades/following?${params}`);
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized');
		throw new Error('Failed to fetch following trades');
	}
	return res.json();
}

export function useFollowingTrades(filters: TradesFilters, limit: number = 50) {
	return useQuery({
		queryKey: ['followingTrades', filters, limit],
		queryFn: () => fetchFollowingTrades(filters, limit),
		retry: (failureCount, error) => {
			if (error.message === 'Unauthorized') return false;
			return failureCount < 3;
		},
	});
}

// Grouped following trades
interface GroupedFollowingFilters {
	categories: string | null;
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
	if (filters.categories) params.set('categories', filters.categories);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades/following/grouped?${params}`);
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized');
		throw new Error('Failed to fetch grouped following trades');
	}
	return res.json();
}

export function useGroupedFollowingTrades(filters: TradesFilters, timeWindowHours: number, limit: number = 50) {
	const groupedFilters: GroupedFollowingFilters = {
		categories: filters.categories,
		event: filters.event,
		minAmount: filters.minAmount,
		timeWindowHours,
	};

	return useQuery({
		queryKey: ['groupedFollowingTrades', groupedFilters, limit],
		queryFn: () => fetchGroupedFollowingTrades(groupedFilters, limit),
		retry: (failureCount, error) => {
			if (error.message === 'Unauthorized') return false;
			return failureCount < 3;
		},
	});
}
