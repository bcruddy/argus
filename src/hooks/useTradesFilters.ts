'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export type SortField = 'time' | 'amount';
export type SortOrder = 'asc' | 'desc';

export interface TradesFilters {
	sort: SortField;
	order: SortOrder;
}

export function useTradesFilters() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const filters: TradesFilters = useMemo(
		() => ({
			sort: (searchParams.get('sort') as SortField) || 'time',
			order: (searchParams.get('order') as SortOrder) || 'desc',
		}),
		[searchParams],
	);

	const setFilters = useCallback(
		(updates: Partial<TradesFilters>) => {
			const params = new URLSearchParams(searchParams.toString());

			if (updates.sort !== undefined) {
				if (updates.sort === 'time') params.delete('sort');
				else params.set('sort', updates.sort);
			}

			if (updates.order !== undefined) {
				if (updates.order === 'desc') params.delete('order');
				else params.set('order', updates.order);
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

	return { filters, setFilters, toggleSort };
}
