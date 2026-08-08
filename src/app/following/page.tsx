'use client';

import { Suspense } from 'react';
import { TradesPage } from '@/components/TradesPage';

export default function FollowingPage() {
	return (
		<Suspense fallback={<div className="container mx-auto py-8 px-4 text-center">Loading...</div>}>
			<TradesPage scope="following" />
		</Suspense>
	);
}
