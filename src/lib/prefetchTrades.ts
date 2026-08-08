import { QueryClient, dehydrate, type DehydratedState } from '@tanstack/react-query';
import { queryTrades, type TradeScope } from '@/lib/queries/trades';
import {
	DEFAULT_MIN_AMOUNT,
	DEFAULT_TRADES_FILTERS,
	DESKTOP_LIMIT,
	followingTradesQueryKey,
	tradesQueryKey,
} from '@/lib/queryKeys';
import { tradesResponseSchema, type TradesQuery } from '@/schemas/api';

// The request the client makes on a cold load with nothing in the URL and nothing in
// localStorage. Mirrors DEFAULT_TRADES_FILTERS plus the paging the desktop table asks
// for; the route handler would derive exactly this from an empty query string.
const DEFAULT_QUERY: TradesQuery = {
	limit: DESKTOP_LIMIT,
	offset: 0,
	sort: 'time',
	order: 'desc',
	category: null,
	event: null,
	minAmount: DEFAULT_MIN_AMOUNT,
	wallet: null,
};

/**
 * Seeds a dehydrated cache with the first page of trades so the first paint has rows
 * instead of "Loading trades...". Hits the DB directly — no HTTP hop back into our own
 * route — and parses through the same response schema the client fetcher uses so the
 * hydrated entry is shape-identical to a fetched one.
 *
 * Only the default-filter key is seeded: any other filter combination hashes to a
 * different key and fetches client-side exactly as before. prefetchQuery swallows
 * failures, so a DB blip degrades to today's client-side fetch rather than a 500.
 */
export async function dehydrateDefaultTrades(scope: TradeScope): Promise<DehydratedState> {
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
