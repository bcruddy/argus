import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// /api/backfill is "public" here because it self-protects with a CRON_SECRET
// bearer token (src/lib/cronAuth.ts) — a session redirect would block cron.
const isPublicRoute = createRouteMatcher([
	'/sign-in(.*)',
	'/sign-up(.*)',
	'/api/webhooks(.*)',
	'/api/health',
	'/api/backfill',
]);

export default clerkMiddleware(async (auth, request) => {
	if (!isPublicRoute(request)) {
		// API callers get a 401 they can handle; a 307 to the Clerk sign-in
		// page defeats client retry/401 logic and leaks the full original URL
		// in redirect_url.
		if (request.nextUrl.pathname.startsWith('/api/')) {
			const { userId } = await auth();
			if (!userId) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
		} else {
			await auth.protect();
		}
	}
});

export const config = {
	matcher: [
		'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
		'/(api|trpc)(.*)',
	],
};
