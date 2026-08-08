'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_MIN_AMOUNT } from '@/lib/queryKeys';

export type SortField = 'time' | 'amount';
export type SortOrder = 'asc' | 'desc';

const THRESHOLD_STORAGE_KEY = 'argus-min-amount';
// Shared with the server prefetch: a different default there would key a different
// query and the hydrated page would silently refetch.
const DEFAULT_THRESHOLD = DEFAULT_MIN_AMOUNT;

export interface TradesFilters {
	sort: SortField;
	order: SortOrder;
	category: string | null;
	event: string | null;
	minAmount: number;
}

function getStoredThreshold(): number {
	if (typeof window === 'undefined') return DEFAULT_THRESHOLD;
	const stored = localStorage.getItem(THRESHOLD_STORAGE_KEY);
	if (!stored) return DEFAULT_THRESHOLD;
	const parsed = parseInt(stored, 10);
	return isNaN(parsed) ? DEFAULT_THRESHOLD : parsed;
}

// Same-tab subscribers. Do NOT notify same-tab listeners by dispatching a synthetic
// StorageEvent: its newValue is null, which reads as "this key was deleted in another
// tab", and at least one third-party storage listener (Clerk's cross-tab sync)
// mirrors that implied deletion by REMOVING the key — verified in-browser: any key
// named in a synthetic storage event vanished within 100ms of being written. Real
// cross-tab storage events are still subscribed below; they carry real newValues.
const thresholdListeners = new Set<() => void>();

function setStoredThreshold(value: number): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(THRESHOLD_STORAGE_KEY, String(value));
	thresholdListeners.forEach((listener) => listener());
}

// Custom hook for localStorage with useSyncExternalStore
function useLocalStorageThreshold(): [number, (value: number) => void, boolean] {
	const subscribe = useCallback((callback: () => void) => {
		thresholdListeners.add(callback);
		// Real storage events from other tabs (key === null means storage.clear()).
		const onStorage = (event: StorageEvent) => {
			if (event.key === THRESHOLD_STORAGE_KEY || event.key === null) callback();
		};
		window.addEventListener('storage', onStorage);
		return () => {
			thresholdListeners.delete(callback);
			window.removeEventListener('storage', onStorage);
		};
	}, []);

	const getSnapshot = useCallback(() => getStoredThreshold(), []);
	const getServerSnapshot = useCallback(() => DEFAULT_THRESHOLD, []);

	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const setValue = useCallback((newValue: number) => {
		setStoredThreshold(newValue);
	}, []);

	// isHydrated is true when we're on the client
	const isHydrated = typeof window !== 'undefined';

	return [value, setValue, isHydrated];
}

export function useTradesFilters() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const [minAmount, setMinAmount, isHydrated] = useLocalStorageThreshold();

	const filters: TradesFilters = useMemo(
		() => ({
			sort: (searchParams.get('sort') as SortField) || 'time',
			order: (searchParams.get('order') as SortOrder) || 'desc',
			category: searchParams.get('category'),
			event: searchParams.get('event'),
			minAmount,
		}),
		[searchParams, minAmount],
	);

	const setFilters = useCallback(
		(updates: Partial<Omit<TradesFilters, 'minAmount'>>) => {
			const params = new URLSearchParams(searchParams.toString());

			if (updates.sort !== undefined) {
				if (updates.sort === 'time') params.delete('sort');
				else params.set('sort', updates.sort);
			}

			if (updates.order !== undefined) {
				if (updates.order === 'desc') params.delete('order');
				else params.set('order', updates.order);
			}

			if (updates.category !== undefined) {
				if (updates.category === null || updates.category === '') params.delete('category');
				else params.set('category', updates.category);
			}

			if (updates.event !== undefined) {
				if (updates.event === null || updates.event === '') params.delete('event');
				else params.set('event', updates.event);
			}

			const query = params.toString();
			router.push(query ? `${pathname}?${query}` : pathname);
		},
		[searchParams, router, pathname],
	);

	const toggleSort = useCallback(
		(field: SortField) => {
			if (filters.sort === field) {
				setFilters({ order: filters.order === 'desc' ? 'asc' : 'desc' });
			} else {
				setFilters({ sort: field, order: 'desc' });
			}
		},
		[filters, setFilters],
	);

	return { filters, setFilters, setMinAmount, toggleSort, isHydrated };
}
