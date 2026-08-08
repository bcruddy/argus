import { describe, expect, it } from 'vitest';
import { GROUPING_FETCH_CAP, buildGroupedTradesResponse, buildTradeGroups, type RawTrade } from './grouping';

const WALLET_A = '0xaaaa000000000000000000000000000000000001';
const WALLET_B = '0xbbbb000000000000000000000000000000000002';

let sequence = 0;

function trade(overrides: Partial<RawTrade> = {}): RawTrade {
	sequence += 1;
	return {
		id: `trade-${sequence}`,
		transaction_hash: `0xhash${sequence}`,
		condition_id: '0xcondition-1',
		asset_id: 'asset-1',
		outcome: 'Yes',
		proxy_wallet: WALLET_A,
		side: 'BUY',
		size: 100,
		price: 0.5,
		usdc_value: 50,
		trade_timestamp: '2026-08-07T12:00:00.000Z',
		title: 'Will the Fed cut rates?',
		category: 'Economics',
		...overrides,
	};
}

describe('buildTradeGroups', () => {
	it('returns nothing for an empty input', () => {
		expect(buildTradeGroups([])).toEqual([]);
	});

	describe('grouping key', () => {
		it('puts same-wallet, same-day trades in one group', () => {
			const groups = buildTradeGroups([
				trade({ trade_timestamp: '2026-08-07T00:00:00.000Z' }),
				trade({ trade_timestamp: '2026-08-07T23:59:59.000Z' }),
			]);

			expect(groups).toHaveLength(1);
			expect(groups[0]?.summary.tradeCount).toBe(2);
		});

		it('splits the same wallet across UTC day boundaries', () => {
			const groups = buildTradeGroups([
				trade({ trade_timestamp: '2026-08-07T23:59:59.000Z' }),
				trade({ trade_timestamp: '2026-08-08T00:00:00.000Z' }),
			]);

			expect(groups).toHaveLength(2);
		});

		it('splits different wallets on the same day', () => {
			const groups = buildTradeGroups([trade({ proxy_wallet: WALLET_A }), trade({ proxy_wallet: WALLET_B })]);

			expect(groups).toHaveLength(2);
			expect(groups.map((g) => g.wallet).sort()).toEqual([WALLET_A, WALLET_B]);
		});

		// The a264b06 fix: multi-event days stay in one umbrella group instead of being
		// split per event, which used to make the same trade appear twice.
		it('never places a trade in two groups', () => {
			const trades = [
				trade({ proxy_wallet: WALLET_A, condition_id: '0xc1' }),
				trade({ proxy_wallet: WALLET_A, condition_id: '0xc2' }),
				trade({ proxy_wallet: WALLET_A, condition_id: '0xc3', trade_timestamp: '2026-08-06T12:00:00.000Z' }),
				trade({ proxy_wallet: WALLET_B, condition_id: '0xc1' }),
				trade({ proxy_wallet: WALLET_B, condition_id: '0xc2', side: 'SELL' }),
			];

			const emitted = buildTradeGroups(trades).flatMap((group) => group.trades.map((t) => t.id));

			expect(new Set(emitted).size).toBe(emitted.length);
			expect(emitted.sort()).toEqual(trades.map((t) => t.id).sort());
		});
	});

	describe('classification', () => {
		it('calls an all-BUY single-event day position_building', () => {
			expect(buildTradeGroups([trade({ side: 'BUY' }), trade({ side: 'BUY' })])[0]?.groupType).toBe(
				'position_building',
			);
		});

		it('calls an all-SELL single-event day position_closing', () => {
			expect(buildTradeGroups([trade({ side: 'SELL' }), trade({ side: 'SELL' })])[0]?.groupType).toBe(
				'position_closing',
			);
		});

		it('calls a mixed-side single-event day position_adjustment', () => {
			expect(buildTradeGroups([trade({ side: 'BUY' }), trade({ side: 'SELL' })])[0]?.groupType).toBe(
				'position_adjustment',
			);
		});

		// Event count wins over side agreement: two markets on one day is multi_event even
		// when every fill is a BUY.
		it('calls any multi-market day multi_event regardless of side', () => {
			expect(
				buildTradeGroups([
					trade({ condition_id: '0xc1', side: 'BUY' }),
					trade({ condition_id: '0xc2', side: 'BUY' }),
				])[0]?.groupType,
			).toBe('multi_event');
		});

		it('classifies a lone BUY as position_building', () => {
			expect(buildTradeGroups([trade({ side: 'BUY' })])[0]?.groupType).toBe('position_building');
		});
	});

	describe('summary', () => {
		// Value-weighted, not a simple mean: a $900 fill at 0.90 must dominate a $100 fill
		// at 0.10. The arithmetic mean would say 0.50.
		it('weights avgPrice by usdc value, not by trade count', () => {
			const groups = buildTradeGroups([trade({ price: 0.1, usdc_value: 100 }), trade({ price: 0.9, usdc_value: 900 })]);

			expect(groups[0]?.summary.avgPrice).toBe(0.82);
		});

		it('rounds avgPrice to 4 decimals', () => {
			const groups = buildTradeGroups([trade({ price: 0.123456789, usdc_value: 1000 })]);

			expect(groups[0]?.summary.avgPrice).toBe(0.1235);
		});

		it('reports avgPrice 0 rather than NaN when total value is 0', () => {
			const groups = buildTradeGroups([trade({ price: 0.5, usdc_value: 0 })]);

			expect(groups[0]?.summary.avgPrice).toBe(0);
		});

		it('adds size on BUY and subtracts it on SELL', () => {
			const groups = buildTradeGroups([
				trade({ side: 'BUY', size: 1000 }),
				trade({ side: 'SELL', size: 250 }),
				trade({ side: 'BUY', size: 100 }),
			]);

			expect(groups[0]?.summary).toMatchObject({ netShares: 850, buyCount: 2, sellCount: 1, tradeCount: 3 });
		});

		it('lets netShares go negative when a wallet is net selling', () => {
			const groups = buildTradeGroups([trade({ side: 'BUY', size: 100 }), trade({ side: 'SELL', size: 400 })]);

			expect(groups[0]?.summary.netShares).toBe(-300);
		});

		it('rounds totalValue and netShares to 2 decimals', () => {
			const groups = buildTradeGroups([
				trade({ usdc_value: 0.005, size: 0.005 }),
				trade({ usdc_value: 0.005, size: 0.005 }),
			]);

			expect(groups[0]?.summary.totalValue).toBe(0.01);
			expect(groups[0]?.summary.netShares).toBe(0.01);
		});

		it('takes first/last trade times from the sorted trades, not the input order', () => {
			const groups = buildTradeGroups([
				trade({ trade_timestamp: '2026-08-07T18:00:00.000Z' }),
				trade({ trade_timestamp: '2026-08-07T06:00:00.000Z' }),
				trade({ trade_timestamp: '2026-08-07T12:00:00.000Z' }),
			]);

			expect(groups[0]?.summary.firstTradeTime).toBe('2026-08-07T06:00:00.000Z');
			expect(groups[0]?.summary.lastTradeTime).toBe('2026-08-07T18:00:00.000Z');
		});

		it('emits trades in ascending timestamp order', () => {
			const groups = buildTradeGroups([
				trade({ trade_timestamp: '2026-08-07T18:00:00.000Z' }),
				trade({ trade_timestamp: '2026-08-07T06:00:00.000Z' }),
			]);

			expect(groups[0]?.trades.map((t) => t.tradeTimestamp)).toEqual([
				'2026-08-07T06:00:00.000Z',
				'2026-08-07T18:00:00.000Z',
			]);
		});
	});

	describe('events', () => {
		it('deduplicates events by condition id', () => {
			const groups = buildTradeGroups([
				trade({ condition_id: '0xc1', title: 'Market one' }),
				trade({ condition_id: '0xc1', title: 'Market one' }),
				trade({ condition_id: '0xc2', title: 'Market two' }),
			]);

			expect(groups[0]?.events).toHaveLength(2);
			expect(groups[0]?.events.map((e) => e.conditionId).sort()).toEqual(['0xc1', '0xc2']);
		});

		it('carries null title and category through', () => {
			const groups = buildTradeGroups([trade({ title: null, category: null })]);

			expect(groups[0]?.events[0]).toMatchObject({ title: null, category: null });
		});
	});

	describe('ordering and identity', () => {
		it('sorts groups by most recent trade time first', () => {
			const groups = buildTradeGroups([
				trade({ proxy_wallet: WALLET_A, trade_timestamp: '2026-08-05T12:00:00.000Z' }),
				trade({ proxy_wallet: WALLET_B, trade_timestamp: '2026-08-07T12:00:00.000Z' }),
			]);

			expect(groups.map((g) => g.wallet)).toEqual([WALLET_B, WALLET_A]);
		});

		it('breaks a lastTradeTime tie by total value, descending', () => {
			const groups = buildTradeGroups([
				trade({ proxy_wallet: WALLET_A, usdc_value: 100 }),
				trade({ proxy_wallet: WALLET_B, usdc_value: 900 }),
			]);

			expect(groups.map((g) => g.wallet)).toEqual([WALLET_B, WALLET_A]);
		});

		it('gives the same wallet+day+events the same id across runs', () => {
			const build = () => buildTradeGroups([trade({ id: 'fixed', transaction_hash: '0xfixed' })])[0]?.id;

			expect(build()).toBe(build());
		});

		it('gives different wallets different ids', () => {
			const groups = buildTradeGroups([trade({ proxy_wallet: WALLET_A }), trade({ proxy_wallet: WALLET_B })]);

			expect(groups[0]?.id).not.toBe(groups[1]?.id);
		});

		it('is insensitive to the order the events arrive in', () => {
			const forward = buildTradeGroups([trade({ condition_id: '0xc1' }), trade({ condition_id: '0xc2' })])[0]?.id;
			const reverse = buildTradeGroups([trade({ condition_id: '0xc2' }), trade({ condition_id: '0xc1' })])[0]?.id;

			expect(forward).toBe(reverse);
		});
	});
});

describe('buildGroupedTradesResponse', () => {
	it('returns an empty, untruncated response for no trades', () => {
		expect(buildGroupedTradesResponse([], 24, 50)).toEqual({
			groups: [],
			meta: { totalGroups: 0, returned: 0, hasMore: false, truncated: false, totalTrades: 0, timeWindowHours: 24 },
		});
	});

	// totalGroups is the pre-slice count. Reporting the post-slice count instead would
	// make hasMore incoherent and hide how much the window actually held.
	it('counts totalGroups before the limit slice', () => {
		const trades = [
			trade({ proxy_wallet: WALLET_A }),
			trade({ proxy_wallet: WALLET_B }),
			trade({ proxy_wallet: '0xcccc000000000000000000000000000000000003' }),
		];

		const response = buildGroupedTradesResponse(trades, 24, 2);

		expect(response.meta.totalGroups).toBe(3);
		expect(response.meta.returned).toBe(2);
		expect(response.groups).toHaveLength(2);
		expect(response.meta.hasMore).toBe(true);
	});

	it('reports hasMore false when the limit is not reached', () => {
		const response = buildGroupedTradesResponse([trade({ proxy_wallet: WALLET_A })], 24, 50);

		expect(response.meta).toMatchObject({ totalGroups: 1, returned: 1, hasMore: false });
	});

	it('reports hasMore false when the group count equals the limit exactly', () => {
		const response = buildGroupedTradesResponse(
			[trade({ proxy_wallet: WALLET_A }), trade({ proxy_wallet: WALLET_B })],
			24,
			2,
		);

		expect(response.meta).toMatchObject({ totalGroups: 2, returned: 2, hasMore: false });
	});

	// totalTrades describes what shipped, so it must follow the slice, not totalGroups.
	it('counts totalTrades across the returned groups only', () => {
		const trades = [
			trade({ proxy_wallet: WALLET_A }),
			trade({ proxy_wallet: WALLET_A }),
			trade({ proxy_wallet: WALLET_B, trade_timestamp: '2026-08-05T12:00:00.000Z' }),
		];

		const response = buildGroupedTradesResponse(trades, 24, 1);

		expect(response.meta.returned).toBe(1);
		expect(response.meta.totalTrades).toBe(2);
	});

	it('echoes timeWindowHours back unchanged', () => {
		expect(buildGroupedTradesResponse([], 168, 50).meta.timeWindowHours).toBe(168);
	});

	describe('truncated', () => {
		// The flag is the only signal a client gets that the window is partially covered:
		// the raw fetch stopped at GROUPING_FETCH_CAP rows, so groups near the far edge of
		// the window may be missing trades.
		it('is true when the input hits the fetch cap', () => {
			const trades = Array.from({ length: GROUPING_FETCH_CAP }, () => trade());

			expect(buildGroupedTradesResponse(trades, 24, 50).meta.truncated).toBe(true);
		});

		it('is false one row below the cap', () => {
			const trades = Array.from({ length: GROUPING_FETCH_CAP - 1 }, () => trade());

			expect(buildGroupedTradesResponse(trades, 24, 50).meta.truncated).toBe(false);
		});
	});
});
