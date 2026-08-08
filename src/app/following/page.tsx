import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { HydrationBoundary } from '@tanstack/react-query';
import { TradesPage } from '@/components/TradesPage';
import { dehydrateDefaultTrades } from '@/lib/prefetchTrades';

// Server Component — see src/app/page.tsx. The followed-wallet scope needs the viewer's
// Clerk id, which is exactly what the route handler passes to the same query.
export default async function FollowingPage() {
	const { userId } = await auth();
	const state = userId ? await dehydrateDefaultTrades({ kind: 'following', clerkId: userId }) : undefined;

	return (
		<Suspense fallback={<div className="container mx-auto py-8 px-4 text-center">Loading...</div>}>
			<HydrationBoundary state={state}>
				<TradesPage scope="following" />
			</HydrationBoundary>
		</Suspense>
	);
}
