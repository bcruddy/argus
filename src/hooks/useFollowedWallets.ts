'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FollowedWallet, FollowedWalletsResponse } from '@/schemas/api';

export type { FollowedWallet, FollowedWalletsResponse };

async function fetchFollowedWallets(): Promise<FollowedWalletsResponse> {
	const res = await fetch('/api/wallets/followed');
	if (!res.ok) {
		if (res.status === 401) {
			throw new Error('Unauthorized');
		}
		throw new Error('Failed to fetch followed wallets');
	}
	return res.json();
}

async function followWallet(walletAddress: string, label?: string): Promise<{ wallet: FollowedWallet }> {
	const res = await fetch('/api/wallets/followed', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ walletAddress, label }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ error: 'Failed to follow wallet' }));
		throw new Error(error.error || 'Failed to follow wallet');
	}
	return res.json();
}

async function unfollowWallet(walletAddress: string): Promise<void> {
	const res = await fetch(`/api/wallets/followed/${walletAddress}`, {
		method: 'DELETE',
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ error: 'Failed to unfollow wallet' }));
		throw new Error(error.error || 'Failed to unfollow wallet');
	}
}

async function updateWalletLabel(walletAddress: string, label: string | null): Promise<{ wallet: FollowedWallet }> {
	const res = await fetch(`/api/wallets/followed/${walletAddress}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ label }),
	});
	if (!res.ok) {
		const error = await res.json().catch(() => ({ error: 'Failed to update wallet label' }));
		throw new Error(error.error || 'Failed to update wallet label');
	}
	return res.json();
}

export function useFollowedWallets() {
	return useQuery({
		queryKey: ['followedWallets'],
		queryFn: fetchFollowedWallets,
		retry: (failureCount, error) => {
			// Don't retry on auth errors
			if (error.message === 'Unauthorized') return false;
			return failureCount < 3;
		},
	});
}

export function useFollowWallet() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ walletAddress, label }: { walletAddress: string; label?: string }) =>
			followWallet(walletAddress, label),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['followedWallets'] });
		},
	});
}

export function useUnfollowWallet() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (walletAddress: string) => unfollowWallet(walletAddress),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['followedWallets'] });
		},
	});
}

export function useUpdateWalletLabel() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ walletAddress, label }: { walletAddress: string; label: string | null }) =>
			updateWalletLabel(walletAddress, label),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['followedWallets'] });
		},
	});
}

// Helper hook to check if a wallet is followed
export function useIsWalletFollowed(walletAddress: string): boolean {
	const { data } = useFollowedWallets();
	if (!data?.wallets) return false;
	return data.wallets.some((w) => w.walletAddress.toLowerCase() === walletAddress.toLowerCase());
}
