import { headers } from 'next/headers';
import { QueryClient, dehydrate, type DehydratedState } from '@tanstack/react-query';
import { queryTrades, type TradeScope } from '@/lib/queries/trades';
import { DEFAULT_TRADES_FILTERS, DESKTOP_LIMIT, followingTradesQueryKey, tradesQueryKey } from '@/lib/queryKeys';
import { tradesResponseSchema, type TradesQuery } from '@/schemas/api';

// The request the desktop table makes on a cold load with nothing in the URL and
// nothing in localStorage. The client sends every DEFAULT_TRADES_FILTERS value
// explicitly (including minAmount — see fetchTrades in useTrades.ts), so the
// server-side equivalent is those filters plus first-page paging. Spread rather
// than hand-mirrored: these values are also the query key, and a copy that drifts
// from the key hydrates data nothing ever reads.
const DEFAULT_QUERY: TradesQuery = {
	...DEFAULT_TRADES_FILTERS,
	limit: DESKTOP_LIMIT,
	offset: 0,
	wallet: null,
};

// Coarse and used only to skip work: a mobile viewport mounts the infinite list,
// whose query key this prefetch does not seed, so the 50-row joined query would be
// fetched and thrown away. A wrong guess costs nothing — the page just fetches
// client-side exactly as before.
function isLikelyMobile(userAgent: string): boolean {
	return /Mobi|Android|iPhone|iPad/i.test(userAgent);
}

/**
 * Seeds a dehydrated cache with the first page of trades so the first paint has rows
 * instead of "Loading trades...". Hits the DB directly — no HTTP hop back into our own
 * route — and parses through the same response schema the client fetcher uses so the
 * hydrated entry is shape-identical to a fetched one.
 *
 * Only the desktop default-filter key is seeded: any other filter combination hashes
 * to a different key and fetches client-side exactly as before. That includes a
 * viewer whose stored min-amount slider moved off the default — localStorage is
 * invisible to the server, so that cohort re-keys and refetches after hydration.
 * prefetchQuery swallows failures, so a DB blip degrades to a client-side fetch
 * rather than a 500.
 */
export async function dehydrateDefaultTrades(scope: TradeScope): Promise<DehydratedState | undefined> {
	const userAgent = (await headers()).get('user-agent') ?? '';
	if (isLikelyMobile(userAgent)) return undefined;

	const queryClient = new QueryClient();

	await queryClient.prefetchQuery({
		queryKey:
			scope.kind === 'all'
				? tradesQueryKey(DEFAULT_TRADES_FILTERS, DESKTOP_LIMIT)
				: followingTradesQueryKey(DEFAULT_TRADES_FILTERS, DESKTOP_LIMIT),
		queryFn: async () => tradesResponseSchema.parse(await queryTrades(DEFAULT_QUERY, scope)),
	});

	return dehydrate(queryClient);
}
