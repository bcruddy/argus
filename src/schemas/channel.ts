import { z } from 'zod';

export const channelTypeSchema = z.enum(['telegram', 'discord', 'webhook']);

export const telegramConfigSchema = z.object({
	chatId: z.string(),
});

export const discordConfigSchema = z.object({
	webhookUrl: z.string().url(),
});

export const webhookConfigSchema = z.object({
	url: z.string().url(),
	headers: z.record(z.string(), z.string()).optional(),
	method: z.enum(['POST', 'PUT']).optional().default('POST'),
});

export const channelConfigSchema = z.union([telegramConfigSchema, discordConfigSchema, webhookConfigSchema]);

export const createChannelSchema = z.object({
	type: channelTypeSchema,
	name: z.string().min(1).max(255),
	config: channelConfigSchema,
	thresholdDefault: z.number().positive().optional(),
	thresholdNearExpiry: z.number().positive().optional(),
	expiryWindowHours: z.number().positive().optional(),
});

export const channelSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	type: channelTypeSchema,
	name: z.string(),
	config: z.record(z.string(), z.unknown()),
	isActive: z.boolean(),
	isVerified: z.boolean(),
	thresholdDefault: z.number().nullable(),
	thresholdNearExpiry: z.number().nullable(),
	expiryWindowHours: z.number().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ChannelType = z.infer<typeof channelTypeSchema>;
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
export type DiscordConfig = z.infer<typeof discordConfigSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
export type CreateChannel = z.infer<typeof createChannelSchema>;
export type Channel = z.infer<typeof channelSchema>;
