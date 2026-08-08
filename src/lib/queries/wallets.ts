import type { FollowedWallet } from '@/schemas/api';
import { toIsoString } from './trades';

// The Neon driver types every row as `any`, so the followed_wallets routes were mapping
// unchecked values straight into their JSON responses. Naming the selected shape here
// (rather than twice, inline, in two route files) is what makes those mappings checked.
// The SQL itself still lives in the routes — only the row contract is shared.
export interface FollowedWalletRow {
	id: string;
	wallet_address: string;
	label: string | null;
	// timestamptz: a Date over the HTTP driver.
	created_at: string | Date;
}

export function toFollowedWallet(row: FollowedWalletRow): FollowedWallet {
	return {
		id: row.id,
		walletAddress: row.wallet_address,
		label: row.label,
		createdAt: toIsoString(row.created_at),
	};
}
