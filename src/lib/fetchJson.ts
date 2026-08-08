import type { ZodType } from 'zod';
import { parseResponse } from '@/schemas/api';

// Thrown by every client fetcher on a non-2xx response so policy code can branch
// on status instead of matching message strings — `error.message === 'Unauthorized'`
// was a convention nothing enforced, and half the fetchers had drifted off it.
export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'HttpError';
	}
}

// The one GET path every fetcher goes through: non-2xx becomes a typed HttpError
// (401 reads as "Unauthorized" where the UI prints error.message), and the body is
// parsed against its response schema so a wire-shape drift fails loudly.
export async function fetchJson<T>(
	path: string,
	schema: ZodType<T>,
	what: string,
	params?: URLSearchParams,
): Promise<T> {
	const res = await fetch(params ? `${path}?${params}` : path);
	if (!res.ok) {
		throw new HttpError(res.status, res.status === 401 ? 'Unauthorized' : `Failed to fetch ${what}`);
	}
	return parseResponse(schema, await res.json(), path);
}
