import { z } from 'zod';

// Helper to transform null to undefined so that .default() can apply
// (searchParams.get() returns null when param is missing, but Zod's .default() only works with undefined)
const nullToUndefined = (val: unknown) => (val === null ? undefined : val);

// Ethereum address regex (0x followed by 40 hex characters)
const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

// Trades API query parameters
export const tradesQuerySchema = z.object({
	limit: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
	sort: z.preprocess(nullToUndefined, z.enum(['time', 'amount']).default('time')),
	order: z.preprocess(nullToUndefined, z.enum(['asc', 'desc']).default('desc')),
	category: z
		.string()
		.max(100)
		.regex(/^[a-zA-Z0-9\s\-_,\/&'()]+$/, 'Invalid category format')
		.optional()
		.nullable(),
	event: z
		.string()
		.max(200)
		.transform((val) => val?.trim())
		.optional()
		.nullable(),
	minAmount: z.preprocess(
		nullToUndefined,
		z.coerce.number().int().min(0).max(100000000).optional(),
	),
	wallet: z
		.string()
		.regex(ethereumAddressRegex, 'Invalid wallet address format')
		.optional()
		.nullable(),
});

export type TradesQuery = z.infer<typeof tradesQuerySchema>;

// Grouped trades API query parameters
export const groupedTradesQuerySchema = z.object({
	category: z
		.string()
		.max(100)
		.regex(/^[a-zA-Z0-9\s\-_,\/&'()]+$/, 'Invalid category format')
		.optional()
		.nullable(),
	event: z
		.string()
		.max(200)
		.transform((val) => val?.trim())
		.optional()
		.nullable(),
	minAmount: z.preprocess(
		nullToUndefined,
		z.coerce.number().int().min(0).max(100000000).optional(),
	),
	wallet: z
		.string()
		.regex(ethereumAddressRegex, 'Invalid wallet address format')
		.optional()
		.nullable(),
	timeWindowHours: z.preprocess(
		nullToUndefined,
		z.coerce.number().int().min(1).max(168).default(24),
	),
	limit: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
});

export type GroupedTradesQuery = z.infer<typeof groupedTradesQuerySchema>;

// Group types for whale activity classification
export type TradeGroupType =
	| 'position_building'
	| 'position_closing'
	| 'position_adjustment'
	| 'multi_event';

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
		totalGroups: number;
		totalTrades: number;
		timeWindowHours: number;
	};
}

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
	label: z
		.string()
		.max(100, 'Label must be 100 characters or less')
		.trim()
		.optional()
		.nullable(),
});

export type FollowWalletInput = z.infer<typeof followWalletSchema>;

export const updateWalletLabelSchema = z.object({
	label: z
		.string()
		.max(100, 'Label must be 100 characters or less')
		.trim()
		.optional()
		.nullable(),
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
