import type { TradesFilters } from '@/hooks/useTradesFilters';

// Rows the desktop table asks for, and the page size the mobile infinite list walks.
export const DESKTOP_LIMIT = 50;
export const MOBILE_PAGE_SIZE = 20;

// The threshold the slider starts at before localStorage says otherwise. The server
// prefetch keys off it, so it has to be the same constant the client reads.
export const DEFAULT_MIN_AMOUNT = 250000;

// Exactly what useTradesFilters produces on a cold load: no search params, no stored
// threshold. The server prefetch only seeds this combination — any other filter set
// hashes to a different key and just fetches client-side.
export const DEFAULT_TRADES_FILTERS: TradesFilters = {
	sort: 'time',
	order: 'desc',
	category: null,
	event: null,
	minAmount: DEFAULT_MIN_AMOUNT,
};

// The keys live here rather than inline in the hooks so a Server Component can build
// the same key without importing a 'use client' module (every export of one becomes a
// client reference and throws when called on the server). A key mismatch between the
// prefetch and the hook is a silent no-op, so there is exactly one construction site.
export function tradesQueryKey(filters: TradesFilters, limit: number) {
	return ['trades', filters, limit] as const;
}

export function infiniteTradesQueryKey(filters: TradesFilters, pageSize: number) {
	return ['infiniteTrades', filters, pageSize] as const;
}

export function followingTradesQueryKey(filters: TradesFilters, limit: number) {
	return ['followingTrades', filters, limit] as const;
}

export function infiniteFollowingTradesQueryKey(filters: TradesFilters, pageSize: number) {
	return ['infiniteFollowingTrades', filters, pageSize] as const;
}
