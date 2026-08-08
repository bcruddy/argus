import { timingSafeEqual } from 'node:crypto';

// Timing-safe check of `Authorization: Bearer <token>` against CRON_SECRET.
// Returns false when CRON_SECRET is unset — operator endpoints fail closed.
// Length check must come first: timingSafeEqual throws on length mismatch.
export function isAuthorizedCron(request: Request): boolean {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;

	const header = request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

	const a = Buffer.from(token);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}
