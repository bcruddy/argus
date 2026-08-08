import { describe, expect, it } from 'vitest';
import {
	MAX_TRADES_OFFSET,
	groupedTradesQuerySchema,
	groupedTradesResponseSchema,
	parseResponse,
	sanitizeForLike,
	tradesQuerySchema,
	tradesResponseSchema,
} from './api';

// The route handlers hand these schemas the raw output of `searchParams.get()`, which
// is `string | null` — never `undefined`. Building the input from a real query string
// keeps the tests honest about that (a missing param is null, an empty param is '').
function tradesParams(queryString: string) {
	const searchParams = new URLSearchParams(queryString);
	return {
		limit: searchParams.get('limit'),
		offset: searchParams.get('offset'),
		sort: searchParams.get('sort'),
		order: searchParams.get('order'),
		category: searchParams.get('category'),
		event: searchParams.get('event'),
		minAmount: searchParams.get('minAmount'),
		wallet: searchParams.get('wallet'),
	};
}

function groupedParams(queryString: string) {
	const searchParams = new URLSearchParams(queryString);
	return {
		category: searchParams.get('category'),
		event: searchParams.get('event'),
		minAmount: searchParams.get('minAmount'),
		wallet: searchParams.get('wallet'),
		timeWindowHours: searchParams.get('timeWindowHours'),
		limit: searchParams.get('limit'),
	};
}

const CHECKSUMMED_WALLET = '0xAbC1230000000000000000000000000000000dEf';
const LOWERCASED_WALLET = '0xabc1230000000000000000000000000000000def';

describe('tradesQuerySchema', () => {
	describe('defaults', () => {
		it('applies every default when no params are present', () => {
			const result = tradesQuerySchema.safeParse(tradesParams(''));

			expect(result.success).toBe(true);
			expect(result.data).toMatchObject({ limit: 50, offset: 0, sort: 'time', order: 'desc' });
		});

		it('leaves the optional filters null rather than dropping them', () => {
			const result = tradesQuerySchema.parse(tradesParams(''));

			expect(result.category).toBeNull();
			expect(result.event).toBeNull();
			expect(result.wallet).toBeNull();
			expect(result.minAmount).toBeUndefined();
		});
	});

	describe('limit', () => {
		it('accepts the documented range', () => {
			expect(tradesQuerySchema.parse(tradesParams('limit=1')).limit).toBe(1);
			expect(tradesQuerySchema.parse(tradesParams('limit=100')).limit).toBe(100);
		});

		it.each([
			['0', 'limit=0'],
			['101', 'limit=101'],
			['-1', 'limit=-1'],
			['abc', 'limit=abc'],
			['50.5', 'limit=50.5'],
		])('rejects limit=%s', (_label, queryString) => {
			expect(tradesQuerySchema.safeParse(tradesParams(queryString)).success).toBe(false);
		});

		// Documented, not endorsed (audit L1): `?limit=` reaches the schema as '', which
		// z.coerce.number() turns into 0, which then fails min(1) — so an empty param 400s
		// instead of falling back to the default. Same for offset and timeWindowHours.
		// If that ever becomes a real complaint, the fix is emptyToUndefined in the
		// preprocess, and this test is what will tell you the behavior changed.
		it('400s on an empty limit param instead of using the default', () => {
			const result = tradesQuerySchema.safeParse(tradesParams('limit='));

			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(['limit']);
			expect(result.error?.issues[0]?.message).toMatch(/Too small/);
		});
	});

	describe('offset', () => {
		it('accepts 0 and the cap', () => {
			expect(tradesQuerySchema.parse(tradesParams('offset=0')).offset).toBe(0);
			expect(tradesQuerySchema.parse(tradesParams(`offset=${MAX_TRADES_OFFSET}`)).offset).toBe(MAX_TRADES_OFFSET);
		});

		// The infinite-scroll hooks clamp against MAX_TRADES_OFFSET precisely because one
		// past the cap is a 400 — see nextOffset in src/hooks/useTrades.ts.
		it('rejects one past the cap', () => {
			const result = tradesQuerySchema.safeParse(tradesParams(`offset=${MAX_TRADES_OFFSET + 1}`));

			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(['offset']);
		});

		it('rejects a negative offset', () => {
			expect(tradesQuerySchema.safeParse(tradesParams('offset=-1')).success).toBe(false);
		});
	});

	describe('sort and order', () => {
		it('accepts the enum members', () => {
			expect(tradesQuerySchema.parse(tradesParams('sort=amount&order=asc'))).toMatchObject({
				sort: 'amount',
				order: 'asc',
			});
		});

		it.each(['sort=price', 'order=sideways', 'sort=', 'order='])('rejects %s', (queryString) => {
			expect(tradesQuerySchema.safeParse(tradesParams(queryString)).success).toBe(false);
		});
	});

	describe('category', () => {
		// The character whitelist was dropped because /api/filters emits raw Polymarket
		// tags, and the regex rejected the very values the UI offers. Category is a bind
		// parameter, so the whitelist bought nothing.
		it.each(['U.S. Politics', 'Trump 2.0', 'Middle East & North Africa', "Women's Sports", 'Crypto/Prices'])(
			'accepts the real-world tag %s',
			(category) => {
				const result = tradesQuerySchema.safeParse(tradesParams(`category=${encodeURIComponent(category)}`));

				expect(result.success).toBe(true);
				expect(result.data?.category).toBe(category);
			},
		);

		it('rejects a category over 100 characters', () => {
			expect(tradesQuerySchema.safeParse(tradesParams(`category=${'a'.repeat(101)}`)).success).toBe(false);
			expect(tradesQuerySchema.safeParse(tradesParams(`category=${'a'.repeat(100)}`)).success).toBe(true);
		});

		// '' used to reach SQL as `m.tags ? ''`, which matches no row — a silent-empty
		// 200 indistinguishable from "no whale trades". Coerced to null so `?category=`
		// means "no filter", the same effective behavior as `?event=`.
		it('treats an empty category as no filter', () => {
			expect(tradesQuerySchema.parse(tradesParams('category=')).category).toBeNull();
		});
	});

	describe('event', () => {
		it('trims surrounding whitespace', () => {
			expect(tradesQuerySchema.parse(tradesParams(`event=${encodeURIComponent('  Fed rate cut  ')}`)).event).toBe(
				'Fed rate cut',
			);
		});

		it('rejects an event over 200 characters', () => {
			expect(tradesQuerySchema.safeParse(tradesParams(`event=${'a'.repeat(201)}`)).success).toBe(false);
			expect(tradesQuerySchema.safeParse(tradesParams(`event=${'a'.repeat(200)}`)).success).toBe(true);
		});

		// Length is checked before the trim, so 200 chars of padding is still 200 chars.
		it('measures length before trimming', () => {
			expect(tradesQuerySchema.safeParse(tradesParams(`event=${encodeURIComponent(' '.repeat(201))}`)).success).toBe(
				false,
			);
		});
	});

	describe('wallet', () => {
		it('lowercases a checksummed address', () => {
			expect(tradesQuerySchema.parse(tradesParams(`wallet=${CHECKSUMMED_WALLET}`)).wallet).toBe(LOWERCASED_WALLET);
		});

		it('leaves an already-lowercase address alone', () => {
			expect(tradesQuerySchema.parse(tradesParams(`wallet=${LOWERCASED_WALLET}`)).wallet).toBe(LOWERCASED_WALLET);
		});

		it.each([
			['too short', '0x123'],
			['no 0x prefix', 'abc1230000000000000000000000000000000def'],
			['41 hex chars', '0xabc1230000000000000000000000000000000deff'],
			['non-hex char', '0xzbc1230000000000000000000000000000000def'],
		])('rejects a wallet that is %s', (_label, wallet) => {
			const result = tradesQuerySchema.safeParse(tradesParams(`wallet=${wallet}`));

			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toBe('Invalid wallet address format');
		});

		// Asymmetry worth knowing about: `?category=` coerces to null and `?event=` sails
		// through as '' (the routes treat it as no filter), but `?wallet=` 400s, because
		// the regex runs before the optional/nullable wrapper.
		it('400s on an empty wallet param', () => {
			expect(tradesQuerySchema.safeParse(tradesParams('wallet=')).success).toBe(false);
		});
	});

	describe('minAmount', () => {
		it('coerces a numeric string', () => {
			expect(tradesQuerySchema.parse(tradesParams('minAmount=250000')).minAmount).toBe(250000);
		});

		it('accepts the bounds', () => {
			expect(tradesQuerySchema.parse(tradesParams('minAmount=0')).minAmount).toBe(0);
			expect(tradesQuerySchema.parse(tradesParams('minAmount=100000000')).minAmount).toBe(100000000);
		});

		it.each(['minAmount=-1', 'minAmount=100000001', 'minAmount=abc', 'minAmount=1.5'])('rejects %s', (queryString) => {
			expect(tradesQuerySchema.safeParse(tradesParams(queryString)).success).toBe(false);
		});

		// Documented current behavior: unlike limit, min(0) lets the coerced '' -> 0 through,
		// so `?minAmount=` silently means "no floor" rather than "unset". Harmless today
		// because 0 and undefined produce the same SQL, but pin it so a change is visible.
		it('turns an empty minAmount param into 0', () => {
			expect(tradesQuerySchema.parse(tradesParams('minAmount=')).minAmount).toBe(0);
		});
	});

	it('reports every bad param at once, not just the first', () => {
		const result = tradesQuerySchema.safeParse(tradesParams('limit=0&offset=-1&sort=nope'));

		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(['limit', 'offset', 'sort']);
	});
});

describe('groupedTradesQuerySchema', () => {
	it('applies defaults when no params are present', () => {
		expect(groupedTradesQuerySchema.parse(groupedParams(''))).toMatchObject({ timeWindowHours: 24, limit: 50 });
	});

	describe('timeWindowHours', () => {
		it('accepts the bounds', () => {
			expect(groupedTradesQuerySchema.parse(groupedParams('timeWindowHours=1')).timeWindowHours).toBe(1);
			expect(groupedTradesQuerySchema.parse(groupedParams('timeWindowHours=168')).timeWindowHours).toBe(168);
		});

		it.each(['timeWindowHours=0', 'timeWindowHours=169', 'timeWindowHours=-1', 'timeWindowHours=abc'])(
			'rejects %s',
			(queryString) => {
				expect(groupedTradesQuerySchema.safeParse(groupedParams(queryString)).success).toBe(false);
			},
		);

		it('400s on an empty timeWindowHours param', () => {
			expect(groupedTradesQuerySchema.safeParse(groupedParams('timeWindowHours=')).success).toBe(false);
		});
	});

	it('shares the trades schema field behavior for category, event and wallet', () => {
		const result = groupedTradesQuerySchema.parse(
			groupedParams(`category=U.S.%20Politics&event=%20%20Fed%20%20&wallet=${CHECKSUMMED_WALLET}`),
		);

		expect(result).toMatchObject({
			category: 'U.S. Politics',
			event: 'Fed',
			wallet: LOWERCASED_WALLET,
		});
	});

	it('clamps limit to the same 1..100 range', () => {
		expect(groupedTradesQuerySchema.parse(groupedParams('limit=100')).limit).toBe(100);
		expect(groupedTradesQuerySchema.safeParse(groupedParams('limit=101')).success).toBe(false);
		expect(groupedTradesQuerySchema.safeParse(groupedParams('limit=0')).success).toBe(false);
	});
});

describe('sanitizeForLike', () => {
	// The whole point: a user searching for "50%" must not match every row in the table.
	it('escapes a trailing percent so it stops being a wildcard', () => {
		expect(sanitizeForLike('50%')).toBe('50\\%');
	});

	it('escapes underscores (the single-character wildcard)', () => {
		expect(sanitizeForLike('a_b')).toBe('a\\_b');
	});

	it('escapes the escape character itself', () => {
		expect(sanitizeForLike('a\\b')).toBe('a\\\\b');
	});

	it('escapes every occurrence, not just the first', () => {
		expect(sanitizeForLike('%%')).toBe('\\%\\%');
		expect(sanitizeForLike('a%b_c%d')).toBe('a\\%b\\_c\\%d');
	});

	it('escapes a mixed payload', () => {
		expect(sanitizeForLike('100%_off\\now')).toBe('100\\%\\_off\\\\now');
	});

	it('leaves ordinary text untouched', () => {
		expect(sanitizeForLike('Fed rate cut')).toBe('Fed rate cut');
		expect(sanitizeForLike("Trump 2.0 & Women's Sports")).toBe("Trump 2.0 & Women's Sports");
	});

	it('returns an empty string unchanged', () => {
		expect(sanitizeForLike('')).toBe('');
	});

	it('is idempotent only in the sense that re-escaping doubles the backslash', () => {
		expect(sanitizeForLike(sanitizeForLike('%'))).toBe('\\\\\\%');
	});
});

// Request validation alone let the client declare `usdc_value: number` while the driver
// handed it a DECIMAL string (audit 2.4). These are the regression tests for that.
describe('response schemas', () => {
	const validTrade = {
		id: 'f1e2d3c4-0000-4000-8000-000000000001',
		transaction_hash: '0xabc',
		condition_id: '0xdef',
		asset_id: '123456',
		outcome: 'Yes',
		proxy_wallet: LOWERCASED_WALLET,
		side: 'BUY' as const,
		size: 1000,
		price: 0.42,
		usdc_value: 420,
		trade_timestamp: '2026-08-07T12:00:00.000Z',
		is_whale: true,
		detection_rule: 'default',
		title: 'Will the Fed cut rates?',
		category: 'Economics',
		created_at: '2026-08-07T12:00:01.000Z',
		wallet_label: null,
	};

	const validPayload = { trades: [validTrade], hasMore: true, offset: 0 };

	it('accepts a well-formed payload', () => {
		expect(tradesResponseSchema.safeParse(validPayload).success).toBe(true);
	});

	it('rejects usdc_value as a string', () => {
		const result = tradesResponseSchema.safeParse({
			...validPayload,
			trades: [{ ...validTrade, usdc_value: '246912.137472' }],
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(['trades', 0, 'usdc_value']);
	});

	it.each(['size', 'price'] as const)('rejects %s as a string', (field) => {
		const result = tradesResponseSchema.safeParse({
			...validPayload,
			trades: [{ ...validTrade, [field]: '100' }],
		});

		expect(result.success).toBe(false);
	});

	it('rejects a side outside the BUY/SELL enum', () => {
		expect(tradesResponseSchema.safeParse({ ...validPayload, trades: [{ ...validTrade, side: 'HOLD' }] }).success).toBe(
			false,
		);
	});

	it('requires wallet_label to be present (nullable, not optional)', () => {
		const { wallet_label: _omitted, ...withoutLabel } = validTrade;

		expect(tradesResponseSchema.safeParse({ ...validPayload, trades: [withoutLabel] }).success).toBe(false);
	});

	it('accepts null in every nullable column', () => {
		const result = tradesResponseSchema.safeParse({
			...validPayload,
			trades: [{ ...validTrade, outcome: null, detection_rule: null, title: null, category: null }],
		});

		expect(result.success).toBe(true);
	});

	// looseObject on purpose: the server adding a column must not break deployed clients.
	it('passes unknown extra fields through', () => {
		const result = tradesResponseSchema.safeParse({
			...validPayload,
			serverAddedLater: 'ok',
			trades: [{ ...validTrade, time_to_expiry_hours: 3 }],
		});

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({ serverAddedLater: 'ok' });
		expect(result.data?.trades[0]).toMatchObject({ time_to_expiry_hours: 3 });
	});

	it('validates the grouped response shape', () => {
		const payload = {
			groups: [
				{
					id: 'abc123',
					wallet: LOWERCASED_WALLET,
					groupType: 'position_building',
					summary: {
						totalValue: 420,
						netShares: 1000,
						tradeCount: 1,
						buyCount: 1,
						sellCount: 0,
						avgPrice: 0.42,
						firstTradeTime: '2026-08-07T12:00:00.000Z',
						lastTradeTime: '2026-08-07T12:00:00.000Z',
					},
					events: [{ conditionId: '0xdef', title: 'Will the Fed cut rates?', category: 'Economics' }],
					trades: [
						{
							id: 'f1e2d3c4-0000-4000-8000-000000000001',
							transactionHash: '0xabc',
							conditionId: '0xdef',
							outcome: 'Yes',
							side: 'BUY',
							size: 1000,
							price: 0.42,
							usdcValue: 420,
							tradeTimestamp: '2026-08-07T12:00:00.000Z',
							title: 'Will the Fed cut rates?',
						},
					],
				},
			],
			meta: { totalGroups: 1, returned: 1, hasMore: false, truncated: false, totalTrades: 1, timeWindowHours: 24 },
		};

		expect(groupedTradesResponseSchema.safeParse(payload).success).toBe(true);
		expect(
			groupedTradesResponseSchema.safeParse({
				...payload,
				meta: { ...payload.meta, totalGroups: '1' },
			}).success,
		).toBe(false);
	});
});

describe('parseResponse', () => {
	it('returns the parsed data on success', () => {
		expect(parseResponse(tradesResponseSchema, { trades: [], hasMore: false, offset: 0 }, '/api/trades')).toEqual({
			trades: [],
			hasMore: false,
			offset: 0,
		});
	});

	it('names the endpoint and the failing path', () => {
		expect(() => parseResponse(tradesResponseSchema, { trades: [], hasMore: 'yes', offset: 0 }, '/api/trades')).toThrow(
			/Malformed response from \/api\/trades: hasMore/,
		);
	});

	it('reports (root) when the failure has no path', () => {
		expect(() => parseResponse(tradesResponseSchema, null, '/api/trades')).toThrow(/\(root\)/);
	});
});
