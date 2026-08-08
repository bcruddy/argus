import { z } from 'zod';

// Helper to transform null to undefined so that .default() can apply
// (searchParams.get() returns null when param is missing, but Zod's .default() only works with undefined)
const nullToUndefined = (val: unknown) => (val === null ? undefined : val);

// Ethereum address regex (0x followed by 40 hex characters)
const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

// Deepest page the trades endpoints will serve. Exported so the infinite-scroll
// hooks can stop at the same number instead of walking into a 400.
export const MAX_TRADES_OFFSET = 10000;

// Category is a raw Polymarket tag ("U.S. Politics", "Trump 2.0"), so no character
// whitelist: it is a bind parameter, and a regex here only rejects legitimate tags
// that /api/filters itself emits.
const categoryField = z.string().max(100).optional().nullable();

// Wallets are stored lowercase (followed_wallets) but ship mixed-case from
// explorers, so normalize on the way in and compare with LOWER() in SQL.
const walletField = z
	.string()
	.regex(ethereumAddressRegex, 'Invalid wallet address format')
	.transform((val) => val.toLowerCase())
	.optional()
	.nullable();

// Trades API query parameters
export const tradesQuerySchema = z.object({
	limit: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
	offset: z.preprocess(nullToUndefined, z.coerce.number().int().min(0).max(MAX_TRADES_OFFSET).default(0)),
	sort: z.preprocess(nullToUndefined, z.enum(['time', 'amount']).default('time')),
	order: z.preprocess(nullToUndefined, z.enum(['asc', 'desc']).default('desc')),
	category: categoryField,
	event: z
		.string()
		.max(200)
		.transform((val) => val?.trim())
		.optional()
		.nullable(),
	minAmount: z.preprocess(nullToUndefined, z.coerce.number().int().min(0).max(100000000).optional()),
	wallet: walletField,
});

export type TradesQuery = z.infer<typeof tradesQuerySchema>;

// Grouped trades API query parameters
export const groupedTradesQuerySchema = z.object({
	category: categoryField,
	event: z
		.string()
		.max(200)
		.transform((val) => val?.trim())
		.optional()
		.nullable(),
	minAmount: z.preprocess(nullToUndefined, z.coerce.number().int().min(0).max(100000000).optional()),
	wallet: walletField,
	timeWindowHours: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(168).default(24)),
	limit: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
});

export type GroupedTradesQuery = z.infer<typeof groupedTradesQuerySchema>;

// Group types for whale activity classification
export type TradeGroupType = 'position_building' | 'position_closing' | 'position_adjustment' | 'multi_event';

// Trade group structure
export interface TradeGroup {
	id: string;
	wallet: string;
	groupType: TradeGroupType;
	summary: {
		totalValue: number;
		netShares: number;
		tradeCount: number;
		buyCount: number;
		sellCount: number;
		avgPrice: number;
		firstTradeTime: string;
		lastTradeTime: string;
	};
	events: Array<{
		conditionId: string;
		title: string | null;
		category: string | null;
	}>;
	trades: Array<{
		id: string;
		transactionHash: string;
		conditionId: string;
		outcome: string | null;
		side: 'BUY' | 'SELL';
		size: number;
		price: number;
		usdcValue: number;
		tradeTimestamp: string;
		title: string | null;
	}>;
}

// Grouped trades API response
export interface GroupedTradesResponse {
	groups: TradeGroup[];
	meta: {
		// Groups built from the fetched window, counted BEFORE the limit slice.
		totalGroups: number;
		// Groups actually present in `groups` (i.e. after the slice).
		returned: number;
		hasMore: boolean;
		// The raw fetch hit GROUPING_FETCH_CAP, so the window is only partially covered.
		truncated: boolean;
		// Trades inside the returned groups.
		totalTrades: number;
		timeWindowHours: number;
	};
}

// Backfill API query parameters (operator endpoint, keyset-paged over markets.condition_id)
export const backfillQuerySchema = z.object({
	limit: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
	cursor: z.string().max(255).optional().nullable(),
});

export type BackfillQuery = z.infer<typeof backfillQuerySchema>;

// Sanitize string for LIKE queries - escapes special SQL LIKE characters
export function sanitizeForLike(input: string): string {
	return input.replace(/[%_\\]/g, '\\$&');
}

// Followed wallets schemas
export const followWalletSchema = z.object({
	walletAddress: z
		.string()
		.regex(ethereumAddressRegex, 'Invalid wallet address format')
		.transform((val) => val.toLowerCase()), // Normalize to lowercase
	label: z.string().max(100, 'Label must be 100 characters or less').trim().optional().nullable(),
});

export type FollowWalletInput = z.infer<typeof followWalletSchema>;

export const updateWalletLabelSchema = z.object({
	label: z.string().max(100, 'Label must be 100 characters or less').trim().optional().nullable(),
});

export type UpdateWalletLabelInput = z.infer<typeof updateWalletLabelSchema>;

// Followed wallet response type
export interface FollowedWallet {
	id: string;
	walletAddress: string;
	label: string | null;
	createdAt: string;
}

export interface FollowedWalletsResponse {
	wallets: FollowedWallet[];
}

// ---------------------------------------------------------------------------
// Response schemas
//
// Request validation alone let the client declare `usdc_value: number` while the
// driver handed it a DECIMAL string (audit 2.4). The fetchers parse against these
// so a type claim that stops being true fails loudly instead of coercing along.
// Loose objects on purpose: adding a server-side field must not break the client.
// ---------------------------------------------------------------------------

export const tradeResponseSchema = z.looseObject({
	id: z.string(),
	transaction_hash: z.string(),
	condition_id: z.string(),
	asset_id: z.string(),
	outcome: z.string().nullable(),
	proxy_wallet: z.string(),
	side: z.enum(['BUY', 'SELL']),
	size: z.number(),
	price: z.number(),
	usdc_value: z.number(),
	trade_timestamp: z.string(),
	is_whale: z.boolean(),
	detection_rule: z.string().nullable(),
	title: z.string().nullable(),
	category: z.string().nullable(),
	created_at: z.string(),
	// Non-null only when the viewer follows the wallet; both trades endpoints select it.
	wallet_label: z.string().nullable(),
});

export const tradesResponseSchema = z.looseObject({
	trades: z.array(tradeResponseSchema),
	hasMore: z.boolean(),
	offset: z.number(),
});

const tradeGroupSchema = z.looseObject({
	id: z.string(),
	wallet: z.string(),
	groupType: z.enum(['position_building', 'position_closing', 'position_adjustment', 'multi_event']),
	summary: z.looseObject({
		totalValue: z.number(),
		netShares: z.number(),
		tradeCount: z.number(),
		buyCount: z.number(),
		sellCount: z.number(),
		avgPrice: z.number(),
		firstTradeTime: z.string(),
		lastTradeTime: z.string(),
	}),
	events: z.array(
		z.looseObject({
			conditionId: z.string(),
			title: z.string().nullable(),
			category: z.string().nullable(),
		}),
	),
	trades: z.array(
		z.looseObject({
			id: z.string(),
			transactionHash: z.string(),
			conditionId: z.string(),
			outcome: z.string().nullable(),
			side: z.enum(['BUY', 'SELL']),
			size: z.number(),
			price: z.number(),
			usdcValue: z.number(),
			tradeTimestamp: z.string(),
			title: z.string().nullable(),
		}),
	),
});

export const groupedTradesResponseSchema = z.looseObject({
	groups: z.array(tradeGroupSchema),
	meta: z.looseObject({
		totalGroups: z.number(),
		returned: z.number(),
		hasMore: z.boolean(),
		truncated: z.boolean(),
		totalTrades: z.number(),
		timeWindowHours: z.number(),
	}),
});

const followedWalletSchema = z.looseObject({
	id: z.string(),
	walletAddress: z.string(),
	label: z.string().nullable(),
	createdAt: z.string(),
});

export const followedWalletsResponseSchema = z.looseObject({
	wallets: z.array(followedWalletSchema),
});

// POST /api/wallets/followed returns the single row it wrote.
export const followWalletResponseSchema = z.looseObject({
	wallet: followedWalletSchema,
});

// Every route's failure body. Parsed rather than trusted so a 500 that returns HTML
// (or nothing) surfaces the caller's fallback message instead of `undefined`.
export const apiErrorSchema = z.looseObject({
	error: z.string(),
});

export const filtersResponseSchema = z.looseObject({
	categories: z.array(z.string()),
});

// Shared by every fetcher: a response that does not match its schema is a bug on
// the wire, so surface the first issue's path rather than a bare "invalid".
export function parseResponse<T>(schema: z.ZodType<T>, data: unknown, endpoint: string): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		const issue = result.error.issues[0];
		const path = issue?.path.join('.') || '(root)';
		throw new Error(`Malformed response from ${endpoint}: ${path} — ${issue?.message ?? 'unknown error'}`);
	}
	return result.data;
}
