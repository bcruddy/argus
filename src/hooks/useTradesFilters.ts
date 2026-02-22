'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type SortField = 'time' | 'amount';
export type SortOrder = 'asc' | 'desc';

const THRESHOLD_STORAGE_KEY = 'argus-min-amount';
const DEFAULT_THRESHOLD = 250000;

export interface TradesFilters {
	sort: SortField;
	order: SortOrder;
	categories: string | null;
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

function setStoredThreshold(value: number): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(THRESHOLD_STORAGE_KEY, String(value));
}

// Custom hook for localStorage with useSyncExternalStore
function useLocalStorageThreshold(): [number, (value: number) => void, boolean] {
	const subscribe = useCallback((callback: () => void) => {
		window.addEventListener('storage', callback);
		return () => window.removeEventListener('storage', callback);
	}, []);

	const getSnapshot = useCallback(() => getStoredThreshold(), []);
	const getServerSnapshot = useCallback(() => DEFAULT_THRESHOLD, []);

	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const setValue = useCallback((newValue: number) => {
		setStoredThreshold(newValue);
		// Trigger a storage event to update subscribers
		window.dispatchEvent(new StorageEvent('storage', { key: THRESHOLD_STORAGE_KEY }));
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
			categories: searchParams.get('categories'),
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

			if (updates.categories !== undefined) {
				if (updates.categories === null || updates.categories === '') params.delete('categories');
				else params.set('categories', updates.categories);
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
