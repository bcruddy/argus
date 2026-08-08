import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { HydrationBoundary } from '@tanstack/react-query';
import { TradesPage } from '@/components/TradesPage';
import { dehydrateDefaultTrades } from '@/lib/prefetchTrades';

// Server Component: the first page of trades is fetched here and handed to the client
// already in the cache. Previously every visit painted "Loading trades..." and only
// started fetching after hydration.
export default async function Home() {
	// Unauthenticated visitors are redirected by the proxy middleware, so this is just
	// belt and braces — and it keeps the page off the static-prerender path.
	const { userId } = await auth();
	const state = userId ? await dehydrateDefaultTrades({ kind: 'all' }) : undefined;

	return (
		<Suspense fallback={<div className="container mx-auto py-8 px-4 text-center">Loading...</div>}>
			<HydrationBoundary state={state}>
				<TradesPage scope="all" />
			</HydrationBoundary>
		</Suspense>
	);
}
