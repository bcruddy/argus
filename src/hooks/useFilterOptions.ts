'use client';

import { useQuery } from '@tanstack/react-query';

export interface FilterOptions {
	categories: string[];
	events: string[];
}

async function fetchFilterOptions(): Promise<FilterOptions> {
	const res = await fetch('/api/filters');
	if (!res.ok) throw new Error('Failed to fetch filter options');
	return res.json();
}

export function useFilterOptions() {
	return useQuery({
		queryKey: ['filterOptions'],
		queryFn: fetchFilterOptions,
		staleTime: 5 * 60 * 1000, // Cache for 5 minutes
	});
}
