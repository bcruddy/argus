import { describe, expect, it } from 'vitest';
import { MAX_TRADES_OFFSET } from '@/schemas/api';
import { nextOffset } from './useTrades';

// getNextPageParam for both infinite trade feeds. The API's offset schema caps at
// MAX_TRADES_OFFSET, so an unclamped `offset + pageSize` walks a scrolling user
// straight into a 400 at the bottom of the list.
describe('nextOffset', () => {
	it('stops when the server says there is nothing more', () => {
		expect(nextOffset({ hasMore: false, offset: 0 }, 20)).toBeUndefined();
		expect(nextOffset({ hasMore: false, offset: 500 }, 20)).toBeUndefined();
	});

	it('advances by one page while more remains', () => {
		expect(nextOffset({ hasMore: true, offset: 0 }, 20)).toBe(20);
		expect(nextOffset({ hasMore: true, offset: 20 }, 20)).toBe(40);
		expect(nextOffset({ hasMore: true, offset: 100 }, 50)).toBe(150);
	});

	// The cap is inclusive on the API side, so landing exactly on it is a legal request.
	it('allows a page that lands exactly on the cap', () => {
		expect(nextOffset({ hasMore: true, offset: MAX_TRADES_OFFSET - 20 }, 20)).toBe(MAX_TRADES_OFFSET);
	});

	it('stops rather than requesting an offset past the cap', () => {
		expect(nextOffset({ hasMore: true, offset: MAX_TRADES_OFFSET }, 20)).toBeUndefined();
		expect(nextOffset({ hasMore: true, offset: MAX_TRADES_OFFSET - 19 }, 20)).toBeUndefined();
	});

	// A page size that does not divide the cap must still not overshoot it.
	it('stops on a page size that straddles the cap', () => {
		expect(nextOffset({ hasMore: true, offset: MAX_TRADES_OFFSET - 10 }, 30)).toBeUndefined();
	});

	it('stops when already past the cap', () => {
		expect(nextOffset({ hasMore: true, offset: MAX_TRADES_OFFSET + 100 }, 20)).toBeUndefined();
	});
});
