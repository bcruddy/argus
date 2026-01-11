import { z } from 'zod';

export const alertStatusSchema = z.enum(['pending', 'sent', 'failed', 'skipped']);

export const alertSchema = z.object({
	id: z.string().uuid(),
	tradeId: z.string().uuid(),
	channelId: z.string().uuid(),
	userId: z.string().uuid(),
	message: z.string(),
	status: alertStatusSchema,
	errorMessage: z.string().nullable(),
	sentAt: z.coerce.date().nullable(),
	retryCount: z.number(),
	createdAt: z.coerce.date(),
});

export const createAlertSchema = z.object({
	tradeId: z.string().uuid(),
	channelId: z.string().uuid(),
	userId: z.string().uuid(),
	message: z.string(),
});

export type AlertStatus = z.infer<typeof alertStatusSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type CreateAlert = z.infer<typeof createAlertSchema>;
