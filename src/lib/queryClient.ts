import { QueryClient } from '@tanstack/react-query';

// One retry policy for the whole app. The per-hook overrides this replaces disagreed
// with it (3 retries vs 1), so a 500 on /following hammered the DB three times while
// the same failure on /trades gave up after one.
const MAX_RETRIES = 1;

function retryUnlessUnauthorized(failureCount: number, error: Error): boolean {
	// A 401 is not going to become a 200 by asking again.
	if (error.message === 'Unauthorized') return false;
	return failureCount < MAX_RETRIES;
}

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000, // 1 minute
				gcTime: 5 * 60 * 1000, // 5 minutes
				refetchOnWindowFocus: false,
				retry: retryUnlessUnauthorized,
			},
			mutations: {
				retry: MAX_RETRIES,
			},
		},
	});
}
