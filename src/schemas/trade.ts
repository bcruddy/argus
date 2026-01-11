import { z } from 'zod';

export const tradeSideSchema = z.enum(['BUY', 'SELL']);

export const tradeSchema = z.object({
	id: z.string().uuid(),
	transactionHash: z.string(),
	marketId: z.string().uuid().nullable(),
	conditionId: z.string(),
	assetId: z.string(),
	outcome: z.string().nullable(),
	proxyWallet: z.string(),
	side: tradeSideSchema,
	size: z.number().positive(),
	price: z.number().min(0).max(1),
	usdcValue: z.number().positive(),
	tradeTimestamp: z.coerce.date(),
	isWhale: z.boolean(),
	detectionRule: z.string().nullable(),
	timeToExpiryHours: z.number().nullable(),
	createdAt: z.coerce.date(),
});

export const polymarketTradeSchema = z.object({
	proxyWallet: z.string(),
	side: tradeSideSchema,
	asset: z.string(),
	conditionId: z.string(),
	size: z.coerce.number(),
	price: z.coerce.number(),
	timestamp: z.coerce.number(),
	title: z.string().optional(),
	transactionHash: z.string(),
	outcome: z.string().optional(),
});

export type TradeSide = z.infer<typeof tradeSideSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type PolymarketTrade = z.infer<typeof polymarketTradeSchema>;
