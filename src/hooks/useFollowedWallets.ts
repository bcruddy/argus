'use client';

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
	apiErrorSchema,
	followWalletResponseSchema,
	followedWalletsResponseSchema,
	parseResponse,
} from '@/schemas/api';
import type { FollowedWallet, FollowedWalletsResponse } from '@/schemas/api';

export type { FollowedWallet, FollowedWalletsResponse };

// A failed mutation's body is whatever the route managed to emit — JSON with an `error`
// string on the happy path, but HTML or nothing from an infrastructure failure. Parse it
// so `error.error` can't quietly become `undefined` in the thrown message.
async function errorMessage(res: Response, fallback: string): Promise<string> {
	const body: unknown = await res.json().catch(() => null);
	const parsed = apiErrorSchema.safeParse(body);
	return parsed.success ? parsed.data.error : fallback;
}

async function fetchFollowedWallets(): Promise<FollowedWalletsResponse> {
	const res = await fetch('/api/wallets/followed');
	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('Unauthorized');
		}
		throw new Error('Failed to fetch followed wallets');
	}
	return parseResponse(followedWalletsResponseSchema, await res.json(), '/api/wallets/followed');
}

async function followWallet(walletAddress: string, label?: string): Promise<{ wallet: FollowedWallet }> {
	const res = await fetch('/api/wallets/followed', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ walletAddress, label }),
	});
	if (!res.ok) {
		throw new Error(await errorMessage(res, 'Failed to follow wallet'));
	}
	return parseResponse(followWalletResponseSchema, await res.json(), '/api/wallets/followed');
}

async function unfollowWallet(walletAddress: string): Promise<void> {
	const res = await fetch(`/api/wallets/followed/${walletAddress}`, {
		method: 'DELETE',
	});
	if (!res.ok) {
		throw new Error(await errorMessage(res, 'Failed to unfollow wallet'));
	}
}

const followedWalletsKey = ['followedWallets'] as const;

// The 401-aware retry policy is a query-client default now (src/lib/queryClient.ts).
export function useFollowedWallets() {
	return useQuery({
		queryKey: followedWalletsKey,
		queryFn: fetchFollowedWallets,
	});
}

// Both mutations write the cache before the request leaves, so the star flips on the
// click instead of a round trip later, and roll back on failure instead of leaving the
// UI asserting something the server rejected.
type FollowContext = { previous: FollowedWalletsResponse | undefined };

async function snapshotFollowedWallets(queryClient: QueryClient): Promise<FollowContext> {
	// In-flight refetches would otherwise land after the optimistic write and undo it.
	await queryClient.cancelQueries({ queryKey: followedWalletsKey });
	return { previous: queryClient.getQueryData<FollowedWalletsResponse>(followedWalletsKey) };
}

export function useFollowWallet() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ walletAddress, label }: { walletAddress: string; label?: string }) =>
			followWallet(walletAddress, label),
		onMutate: async ({ walletAddress, label }) => {
			const context = await snapshotFollowedWallets(queryClient);
			queryClient.setQueryData<FollowedWalletsResponse>(followedWalletsKey, (current) => {
				const wallets = current?.wallets ?? [];
				const normalized = walletAddress.toLowerCase();
				if (wallets.some((w) => w.walletAddress.toLowerCase() === normalized)) return current;
				// Placeholder id/createdAt: the real row arrives with the onSettled invalidate.
				const optimistic: FollowedWallet = {
					id: `optimistic-${normalized}`,
					walletAddress: normalized,
					label: label ?? null,
					createdAt: new Date().toISOString(),
				};
				return { ...current, wallets: [...wallets, optimistic] };
			});
			return context;
		},
		onError: (_error, _variables, context) => {
			queryClient.setQueryData(followedWalletsKey, context?.previous);
		},
		onSettled: () => {
			// Deliberately not returned: awaiting the refetch here would keep isPending
			// true past the optimistic update the button already rendered.
			void queryClient.invalidateQueries({ queryKey: followedWalletsKey });
		},
	});
}

export function useUnfollowWallet() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (walletAddress: string) => unfollowWallet(walletAddress),
		onMutate: async (walletAddress) => {
			const context = await snapshotFollowedWallets(queryClient);
			queryClient.setQueryData<FollowedWalletsResponse>(followedWalletsKey, (current) => {
				if (!current) return current;
				const normalized = walletAddress.toLowerCase();
				return { ...current, wallets: current.wallets.filter((w) => w.walletAddress.toLowerCase() !== normalized) };
			});
			return context;
		},
		onError: (_error, _variables, context) => {
			queryClient.setQueryData(followedWalletsKey, context?.previous);
		},
		onSettled: () => {
			// Deliberately not returned: awaiting the refetch here would keep isPending
			// true past the optimistic update the button already rendered.
			void queryClient.invalidateQueries({ queryKey: followedWalletsKey });
		},
	});
}
