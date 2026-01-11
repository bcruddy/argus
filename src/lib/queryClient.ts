import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000, // 1 minute
				gcTime: 5 * 60 * 1000, // 5 minutes
				refetchOnWindowFocus: false,
				retry: 1,
			},
			mutations: {
				retry: 1,
			},
		},
	});
}
