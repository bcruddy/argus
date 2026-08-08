import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateUsdValue, fetchWithRetry, NonRetryableHttpError } from './polymarket';

describe('calculateUsdValue', () => {
	it('multiplies size by price', () => {
		expect(calculateUsdValue(100, 0.5)).toBe(50);
	});

	it('returns 0 when either factor is 0', () => {
		expect(calculateUsdValue(0, 0.5)).toBe(0);
		expect(calculateUsdValue(100, 0)).toBe(0);
	});

	// Whale rows come off the wire as DECIMAL strings coerced to float64. Pin the exact
	// IEEE-754 product so a future "let's round it" edit shows up as a failing test rather
	// than as trades silently sliding across the $250k threshold.
	it('preserves full float64 precision (no rounding)', () => {
		expect(calculateUsdValue(500000.93, 0.999)).toBe(499500.92907);
	});

	it('does not round away sub-cent drift', () => {
		expect(calculateUsdValue(3, 0.1)).toBe(0.30000000000000004);
	});

	// Multiplication commutes, so a pure (size, price) -> (price, size) swap is invisible
	// by value. What this pins is the *shape* of the formula: it fails loudly if anyone
	// "fixes" it into size/price, price/size, or a percentage form.
	it('is a product, not a quotient (argument-order regression)', () => {
		expect(calculateUsdValue(1_000_000, 0.03)).toBe(30_000);
		expect(calculateUsdValue(1_000_000, 0.03)).not.toBe(1_000_000 / 0.03);
		expect(calculateUsdValue(1_000_000, 0.03)).not.toBe(0.03 / 1_000_000);
	});

	it('handles the whale threshold boundary exactly', () => {
		expect(calculateUsdValue(500_000, 0.5)).toBe(250_000);
	});
});

describe('fetchWithRetry', () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
		// Backoff is 1s then 2s of real sleeping; fake timers keep the suite instant.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const ok = () => new Response('{}', { status: 200 });
	const fail = (status: number, statusText: string) => new Response('', { status, statusText });

	it('returns on the first attempt when the response is ok', async () => {
		fetchMock.mockResolvedValueOnce(ok());

		const response = await fetchWithRetry('https://example.test/trades');

		expect(response.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('forwards init and attaches a timeout signal', async () => {
		fetchMock.mockResolvedValueOnce(ok());

		await fetchWithRetry('https://example.test/trades', { headers: { Accept: 'application/json' } });

		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.headers).toEqual({ Accept: 'application/json' });
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	// A 404 on a resolved market will be a 404 forever; retrying it three times just
	// triples the latency of every ingest run.
	it('does not retry a non-retryable status', async () => {
		fetchMock.mockResolvedValue(fail(404, 'Not Found'));

		const promise = fetchWithRetry('https://example.test/markets/0xdead');

		await expect(promise).rejects.toBeInstanceOf(NonRetryableHttpError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('surfaces the status and statusText on a non-retryable failure', async () => {
		fetchMock.mockResolvedValue(fail(404, 'Not Found'));

		await expect(fetchWithRetry('https://example.test/x')).rejects.toThrow('Polymarket API error: 404 Not Found');
	});

	it('retries a 500 and succeeds on the second attempt', async () => {
		fetchMock.mockResolvedValueOnce(fail(500, 'Internal Server Error')).mockResolvedValueOnce(ok());

		const promise = fetchWithRetry('https://example.test/trades');
		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).resolves.toMatchObject({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries a 429 (rate limit is retryable)', async () => {
		fetchMock.mockResolvedValueOnce(fail(429, 'Too Many Requests')).mockResolvedValueOnce(ok());

		const promise = fetchWithRetry('https://example.test/trades');
		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).resolves.toMatchObject({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives up after 3 attempts on repeated 500s', async () => {
		fetchMock.mockResolvedValue(fail(500, 'Internal Server Error'));

		const promise = fetchWithRetry('https://example.test/trades');
		const assertion = expect(promise).rejects.toThrow('Polymarket API error: 500');
		await vi.advanceTimersByTimeAsync(1000 + 2000);
		await assertion;

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('retries a transport failure', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(ok());

		const promise = fetchWithRetry('https://example.test/trades');
		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).resolves.toMatchObject({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('backs off exponentially: 1s before attempt 2, 2s before attempt 3', async () => {
		fetchMock.mockResolvedValue(fail(503, 'Service Unavailable'));

		const promise = fetchWithRetry('https://example.test/trades');
		const assertion = expect(promise).rejects.toThrow();

		await vi.advanceTimersByTimeAsync(999);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1999);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);
		expect(fetchMock).toHaveBeenCalledTimes(3);

		await assertion;
	});
});
