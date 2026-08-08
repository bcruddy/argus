'use client';

import { useQuery } from '@tanstack/react-query';
import { filtersResponseSchema } from '@/schemas/api';
import { fetchJson } from '@/lib/fetchJson';

export interface FilterOptions {
	categories: string[];
}

function fetchFilterOptions(): Promise<FilterOptions> {
	return fetchJson('/api/filters', filtersResponseSchema, 'filter options');
}

export function useFilterOptions() {
	return useQuery({
		queryKey: ['filterOptions'],
		queryFn: fetchFilterOptions,
		staleTime: 5 * 60 * 1000, // Cache for 5 minutes
	});
}
