import { describe, expect, it } from 'vitest';
import {
	formatNumber,
	formatPrice,
	formatTimestamp,
	formatTimestampShort,
	formatUsd,
	formatWallet,
	polygonscanTxUrl,
} from './format';

// Every expectation below is pinned to en-US because the formatters hard-code that
// locale — they must not drift with the runner's default locale.
describe('formatUsd', () => {
	it('renders whole dollars with no cents', () => {
		expect(formatUsd(250000)).toBe('$250,000');
	});

	it('rounds to the nearest dollar', () => {
		expect(formatUsd(1234.56)).toBe('$1,235');
		expect(formatUsd(999.5)).toBe('$1,000');
	});

	it('renders zero', () => {
		expect(formatUsd(0)).toBe('$0');
	});

	it('puts the sign ahead of the currency symbol for negatives', () => {
		expect(formatUsd(-1000.4)).toBe('-$1,000');
	});

	it('groups thousands', () => {
		expect(formatUsd(1234567.89)).toBe('$1,234,568');
	});
});

describe('formatPrice', () => {
	// Prediction-market prices live in [0,1] and grouping.ts deliberately keeps four
	// decimals of avgPrice, so the unified formatter must not collapse a $0.004
	// longshot to $0.00. Whole-cent prices keep the familiar two-decimal shape.
	it('shows at least two decimals', () => {
		expect(formatPrice(0.5)).toBe('$0.50');
		expect(formatPrice(1)).toBe('$1.00');
		expect(formatPrice(0)).toBe('$0.00');
	});

	it('keeps sub-cent precision up to four decimals', () => {
		expect(formatPrice(0.004)).toBe('$0.004');
		expect(formatPrice(0.1234)).toBe('$0.1234');
		expect(formatPrice(0.9999)).toBe('$0.9999');
	});

	it('rounds past four decimals instead of showing more', () => {
		expect(formatPrice(0.00042)).toBe('$0.0004');
	});
});

describe('formatNumber', () => {
	it('groups thousands with no decimals', () => {
		expect(formatNumber(1234567.89)).toBe('1,234,568');
		expect(formatNumber(1000000)).toBe('1,000,000');
	});

	it('renders zero and negatives', () => {
		expect(formatNumber(0)).toBe('0');
		expect(formatNumber(-5.5)).toBe('-6');
	});

	it('carries no currency symbol', () => {
		expect(formatNumber(250000)).toBe('250,000');
	});
});

describe('formatWallet', () => {
	const wallet = '0x1234567890abcdef1234567890abcdef12345678';

	it('truncates to first 6 and last 4 characters', () => {
		expect(formatWallet(wallet)).toBe('0x1234...5678');
	});

	it('prefers a label when one is present', () => {
		expect(formatWallet(wallet, 'Whale #1')).toBe('Whale #1');
	});

	// The label column is nullable and the UI passes it straight through, so both the
	// null and the empty-string case have to fall back to the address.
	it('falls back to truncation for null, undefined and empty labels', () => {
		expect(formatWallet(wallet, null)).toBe('0x1234...5678');
		expect(formatWallet(wallet, undefined)).toBe('0x1234...5678');
		expect(formatWallet(wallet, '')).toBe('0x1234...5678');
	});

	it('leaves short strings alone rather than making them longer', () => {
		expect(formatWallet('0x1234')).toBe('0x1234');
		expect(formatWallet('0x12345678')).toBe('0x12345678');
	});

	it('truncates at the 11-character boundary', () => {
		expect(formatWallet('0x12345678')).toBe('0x12345678');
		expect(formatWallet('0x123456789ab')).toBe('0x1234...89ab');
	});
});

describe('formatTimestamp', () => {
	// Locale is pinned to en-US so server and client agree on the shape; the timezone
	// stays viewer-local, which is why the render sites carry suppressHydrationWarning.
	it('renders the en-US "M/D/YYYY, HH:MM:SS AM/PM" shape regardless of runner locale', () => {
		expect(formatTimestamp('2026-08-07T12:00:00.000Z')).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M$/);
	});
});

describe('formatTimestampShort', () => {
	// Locale-shaped but timezone-dependent, so assert the shape rather than the instant.
	it('renders "Mon D HH:MM AM/PM"', () => {
		expect(formatTimestampShort('2026-08-07T12:00:00.000Z')).toMatch(/^[A-Z][a-z]{2} \d{1,2} \d{2}:\d{2} [AP]M$/);
	});
});

describe('polygonscanTxUrl', () => {
	it('builds the explorer link', () => {
		expect(polygonscanTxUrl('0xdeadbeef')).toBe('https://polygonscan.com/tx/0xdeadbeef');
	});
});
