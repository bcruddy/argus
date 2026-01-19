'use client';

import { useQuery } from '@tanstack/react-query';
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
}

async function fetchTrades(filters: TradesFilters, limit: number): Promise<TradesResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(limit));
	if (filters.sort !== 'time') params.set('sort', filters.sort);
	if (filters.order !== 'desc') params.set('order', filters.order);
	if (filters.category) params.set('category', filters.category);
	if (filters.event) params.set('event', filters.event);
	if (filters.minAmount) params.set('minAmount', String(filters.minAmount));

	const res = await fetch(`/api/trades?${params}`);
	if (!res.ok) throw new Error('Failed to fetch trades');
	return res.json();
}

export function useTrades(filters: TradesFilters, limit: number = 50) {
	return useQuery({
		queryKey: ['trades', filters, limit],
		queryFn: () => fetchTrades(filters, limit),
	});
}
