'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Without this, an exception anywhere in the tree produced Next's default error page.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => {
		console.error('Unhandled page error:', error);
	}, [error]);

	return (
		<div className="container mx-auto flex min-h-[60vh] items-center justify-center px-3 py-8 md:px-4">
			<div role="alert" className="max-w-md text-center">
				<h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
				<p className="text-muted-foreground mb-4 text-sm">
					{error.message || 'An unexpected error stopped this page from loading.'}
				</p>
				{error.digest && <p className="text-muted-foreground mb-4 font-mono text-xs">Reference: {error.digest}</p>}
				<Button onClick={reset}>Try again</Button>
			</div>
		</div>
	);
}
