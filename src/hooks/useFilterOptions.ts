'use client';

import { useQuery } from '@tanstack/react-query';
import { filtersResponseSchema, parseResponse } from '@/schemas/api';

export interface FilterOptions {
	categories: string[];
}

async function fetchFilterOptions(): Promise<FilterOptions> {
	const res = await fetch('/api/filters');
	if (!res.ok) throw new Error('Failed to fetch filter options');
	return parseResponse(filtersResponseSchema, await res.json(), '/api/filters');
}

export function useFilterOptions() {
	return useQuery({
		queryKey: ['filterOptions'],
		queryFn: fetchFilterOptions,
		staleTime: 5 * 60 * 1000, // Cache for 5 minutes
	});
}
