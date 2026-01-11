import { z } from 'zod';

export const marketTagSchema = z.object({
	id: z.string(),
	label: z.string(),
	slug: z.string(),
});

export const marketOutcomeSchema = z.object({
	outcome: z.string(),
	tokenId: z.string(),
});

export const marketSchema = z.object({
	id: z.string().uuid(),
	conditionId: z.string(),
	slug: z.string().nullable(),
	question: z.string(),
	description: z.string().nullable(),
	imageUrl: z.string().nullable(),
	tags: z.array(marketTagSchema),
	isActive: z.boolean(),
	isClosed: z.boolean(),
	endDate: z.coerce.date().nullable(),
	closedTime: z.coerce.date().nullable(),
	outcomes: z.array(marketOutcomeSchema),
	lastSyncedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const createMarketSchema = z.object({
	conditionId: z.string(),
	slug: z.string().optional(),
	question: z.string(),
	description: z.string().optional(),
	imageUrl: z.string().url().optional(),
	tags: z.array(marketTagSchema).optional(),
	endDate: z.coerce.date().optional(),
	outcomes: z.array(marketOutcomeSchema).optional(),
});

export type MarketTag = z.infer<typeof marketTagSchema>;
export type MarketOutcome = z.infer<typeof marketOutcomeSchema>;
export type Market = z.infer<typeof marketSchema>;
export type CreateMarket = z.infer<typeof createMarketSchema>;
