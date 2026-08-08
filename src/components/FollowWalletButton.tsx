'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFollowedWallets, useFollowWallet, useUnfollowWallet } from '@/hooks/useFollowedWallets';
import { formatWallet } from '@/lib/format';
import { Star } from 'lucide-react';

interface FollowWalletButtonProps {
	walletAddress: string;
}

export function FollowWalletButton({ walletAddress }: FollowWalletButtonProps) {
	const { data: followedWallets } = useFollowedWallets();
	const followMutation = useFollowWallet();
	const unfollowMutation = useUnfollowWallet();
	const [isHovered, setIsHovered] = useState(false);

	const normalizedAddress = walletAddress.toLowerCase();
	const isFollowed = !!followedWallets?.wallets?.some((w) => w.walletAddress.toLowerCase() === normalizedAddress);

	const isLoading = followMutation.isPending || unfollowMutation.isPending;
	const failure = followMutation.error ?? unfollowMutation.error;
	const shortWallet = formatWallet(walletAddress);

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation(); // Prevent triggering parent click handlers
		if (isFollowed) {
			unfollowMutation.mutate(normalizedAddress);
		} else {
			followMutation.mutate({ walletAddress: normalizedAddress });
		}
	};

	// A failed follow used to be indistinguishable from a slow one: the star flipped
	// back with no explanation. Now the control says so, and a live region says it out
	// loud for anyone not watching the icon.
	const label = failure
		? `Retry ${isFollowed ? 'unfollowing' : 'following'} wallet ${shortWallet} — last attempt failed`
		: `${isFollowed ? 'Unfollow' : 'Follow'} wallet ${shortWallet}`;

	const announcement = failure
		? `Could not ${isFollowed ? 'unfollow' : 'follow'} wallet ${shortWallet}. ${failure.message}`
		: '';

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				onClick={handleClick}
				disabled={isLoading}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				className={`h-6 w-6 ${failure ? 'text-destructive' : isFollowed ? 'text-yellow-500' : 'text-muted-foreground'}`}
				title={label}
				aria-label={label}
				aria-pressed={isFollowed}
			>
				<Star
					className={`h-3.5 w-3.5 ${isFollowed ? 'fill-current' : ''} ${isHovered && !isFollowed && !failure ? 'text-yellow-500' : ''}`}
				/>
			</Button>
			<span role="status" className="sr-only">
				{announcement}
			</span>
		</>
	);
}
