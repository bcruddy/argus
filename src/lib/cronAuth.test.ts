import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAuthorizedCron } from './cronAuth';

const SECRET = 'super-secret-cron-token';
const ORIGINAL_SECRET = process.env.CRON_SECRET;

function requestWith(headers: Record<string, string> = {}): Request {
	return new Request('http://argus.test/api/ingest', { headers });
}

beforeEach(() => {
	process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
	if (ORIGINAL_SECRET === undefined) {
		delete process.env.CRON_SECRET;
	} else {
		process.env.CRON_SECRET = ORIGINAL_SECRET;
	}
});

describe('isAuthorizedCron', () => {
	it('accepts the matching bearer token', () => {
		expect(isAuthorizedCron(requestWith({ authorization: `Bearer ${SECRET}` }))).toBe(true);
	});

	it('accepts a differently-cased header name', () => {
		expect(isAuthorizedCron(requestWith({ Authorization: `Bearer ${SECRET}` }))).toBe(true);
	});

	it('rejects a wrong token of the same length', () => {
		const sameLengthWrong = 'x'.repeat(SECRET.length);

		expect(sameLengthWrong).toHaveLength(SECRET.length);
		expect(isAuthorizedCron(requestWith({ authorization: `Bearer ${sameLengthWrong}` }))).toBe(false);
	});

	// timingSafeEqual throws on a length mismatch, so the length guard has to run first.
	// A throw here would become a 500 instead of a 401 — worse, it would be a 500 that
	// tells the caller their guess was the wrong length.
	it('returns false, not a throw, on a shorter token', () => {
		expect(() => isAuthorizedCron(requestWith({ authorization: 'Bearer short' }))).not.toThrow();
		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer short' }))).toBe(false);
	});

	it('returns false, not a throw, on a longer token', () => {
		const longer = `${SECRET}-and-then-some-more`;

		expect(() => isAuthorizedCron(requestWith({ authorization: `Bearer ${longer}` }))).not.toThrow();
		expect(isAuthorizedCron(requestWith({ authorization: `Bearer ${longer}` }))).toBe(false);
	});

	it('rejects a request with no authorization header', () => {
		expect(isAuthorizedCron(requestWith())).toBe(false);
	});

	it('rejects an empty authorization header', () => {
		expect(isAuthorizedCron(requestWith({ authorization: '' }))).toBe(false);
	});

	it('rejects a bare token with no Bearer scheme', () => {
		expect(isAuthorizedCron(requestWith({ authorization: SECRET }))).toBe(false);
	});

	it('rejects a non-Bearer scheme carrying the right secret', () => {
		expect(isAuthorizedCron(requestWith({ authorization: `Basic ${SECRET}` }))).toBe(false);
		expect(isAuthorizedCron(requestWith({ authorization: `Token ${SECRET}` }))).toBe(false);
	});

	it('is case-sensitive about the Bearer scheme', () => {
		expect(isAuthorizedCron(requestWith({ authorization: `bearer ${SECRET}` }))).toBe(false);
		expect(isAuthorizedCron(requestWith({ authorization: `BEARER ${SECRET}` }))).toBe(false);
	});

	it('rejects a Bearer prefix with no token', () => {
		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer ' }))).toBe(false);
	});

	// Fails closed: a deployment that forgot CRON_SECRET must not become an open ingest
	// endpoint, and in particular an empty header must not "match" an empty secret.
	it('rejects everything when CRON_SECRET is unset', () => {
		delete process.env.CRON_SECRET;

		expect(isAuthorizedCron(requestWith({ authorization: `Bearer ${SECRET}` }))).toBe(false);
		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer ' }))).toBe(false);
		expect(isAuthorizedCron(requestWith())).toBe(false);
	});

	it('rejects everything when CRON_SECRET is the empty string', () => {
		process.env.CRON_SECRET = '';

		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer ' }))).toBe(false);
		expect(isAuthorizedCron(requestWith())).toBe(false);
	});

	it('compares bytes, not a prefix', () => {
		process.env.CRON_SECRET = 'abcdef';

		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer abcdeg' }))).toBe(false);
		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer abcdef' }))).toBe(true);
	});

	// The comparison is over UTF-8 bytes, so a non-ASCII secret is longer in bytes than
	// in characters. It still matches, and a same-character-count near-miss still fails.
	it('compares multi-byte secrets by byte, not by character', () => {
		process.env.CRON_SECRET = 'sécret-tøken';

		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer sécret-tøken' }))).toBe(true);
		expect(isAuthorizedCron(requestWith({ authorization: 'Bearer secret-token' }))).toBe(false);
	});

	// Operational footgun worth pinning: HTTP header values are ByteStrings, so a
	// CRON_SECRET containing anything above U+00FF can never reach this function — the
	// caller cannot even construct the request. Keep secrets ASCII.
	it('cannot be reached at all by a secret above U+00FF', () => {
		expect(() => requestWith({ authorization: 'Bearer 🔑' })).toThrow();
	});
});
