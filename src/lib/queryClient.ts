import { QueryClient } from '@tanstack/react-query';
import { HttpError } from '@/lib/fetchJson';

// One retry policy for the whole app. The per-hook overrides this replaces disagreed
// with it (3 retries vs 1), so a 500 on /following hammered the DB three times while
// the same failure on /trades gave up after one.
const MAX_RETRIES = 1;

// Exported for the unit test. A 401 is not going to become a 200 by asking again;
// the check is the typed status, not the message — string matching is what let
// three fetchers silently re-enable retrying auth failures.
export function retryUnlessUnauthorized(failureCount: number, error: Error): boolean {
	if (error instanceof HttpError && error.status === 401) return false;
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
