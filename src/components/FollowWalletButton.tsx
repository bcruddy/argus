'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFollowedWallets, useFollowWallet, useUnfollowWallet } from '@/hooks/useFollowedWallets';
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
	const isFollowed = followedWallets?.wallets?.some((w) => w.walletAddress.toLowerCase() === normalizedAddress);

	const isLoading = followMutation.isPending || unfollowMutation.isPending;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation(); // Prevent triggering parent click handlers
		if (isFollowed) {
			unfollowMutation.mutate(normalizedAddress);
		} else {
			followMutation.mutate({ walletAddress: normalizedAddress });
		}
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={handleClick}
			disabled={isLoading}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className={`h-6 w-6 ${isFollowed ? 'text-yellow-500' : 'text-muted-foreground'}`}
			title={isFollowed ? 'Unfollow wallet' : 'Follow wallet'}
		>
			<Star
				className={`h-3.5 w-3.5 ${isFollowed ? 'fill-current' : ''} ${isHovered && !isFollowed ? 'text-yellow-500' : ''}`}
			/>
		</Button>
	);
}
