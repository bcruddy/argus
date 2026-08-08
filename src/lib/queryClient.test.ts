import { describe, expect, it } from 'vitest';
import { retryUnlessUnauthorized } from './queryClient';
import { HttpError } from './fetchJson';

describe('retryUnlessUnauthorized', () => {
	it('never retries a 401', () => {
		expect(retryUnlessUnauthorized(0, new HttpError(401, 'Unauthorized'))).toBe(false);
	});

	it('retries other HTTP failures exactly once', () => {
		expect(retryUnlessUnauthorized(0, new HttpError(500, 'Failed to fetch trades'))).toBe(true);
		expect(retryUnlessUnauthorized(1, new HttpError(500, 'Failed to fetch trades'))).toBe(false);
	});

	// The old policy matched error.message === 'Unauthorized', which half the fetchers
	// didn't emit. Only the typed status short-circuits now.
	it('ignores message strings — an untyped "Unauthorized" error still retries', () => {
		expect(retryUnlessUnauthorized(0, new Error('Unauthorized'))).toBe(true);
	});
});
