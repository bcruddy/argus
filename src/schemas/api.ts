import { z } from 'zod';

// Helper to transform null to undefined so that .default() can apply
// (searchParams.get() returns null when param is missing, but Zod's .default() only works with undefined)
const nullToUndefined = (val: unknown) => (val === null ? undefined : val);

// Trades API query parameters
export const tradesQuerySchema = z.object({
	limit: z.preprocess(nullToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
	sort: z.preprocess(nullToUndefined, z.enum(['time', 'amount']).default('time')),
	order: z.preprocess(nullToUndefined, z.enum(['asc', 'desc']).default('desc')),
	category: z
		.string()
		.max(100)
		.regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid category format')
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
});

export type TradesQuery = z.infer<typeof tradesQuerySchema>;

// Sanitize string for LIKE queries - escapes special SQL LIKE characters
export function sanitizeForLike(input: string): string {
	return input.replace(/[%_\\]/g, '\\$&');
}
