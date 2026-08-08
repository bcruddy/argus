import { z } from 'zod';

const tradeSideSchema = z.enum(['BUY', 'SELL']);

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

export type PolymarketTrade = z.infer<typeof polymarketTradeSchema>;
