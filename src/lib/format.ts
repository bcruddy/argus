// Shared display formatters. These lived in four files (page.tsx, following/page.tsx,
// GroupedTradesView.tsx, WhaleSplash.tsx) and had already drifted apart — see the
// formatPrice note below.
//
// The Intl instances are module-level because the old copies constructed a fresh
// formatter on every table cell.

const usdFormatter = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

// Prices live in [0,1] and grouping.ts keeps four decimals of avgPrice, so the
// unified formatter allows four: capping at 2 rendered a $0.004 longshot as $0.00.
const priceFormatter = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

export function formatUsd(value: number): string {
	return usdFormatter.format(value);
}

export function formatPrice(value: number): string {
	return priceFormatter.format(value);
}

export function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

// The label-aware variant from following/page.tsx — a wallet with no label falls
// back to the truncated address, which is what the unlabelled callers want anyway.
export function formatWallet(wallet: string, label?: string | null): string {
	if (label) return label;
	if (wallet.length <= 10) return wallet;
	return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

// Locale pinned like every other formatter here; the timezone is deliberately the
// viewer's, which differs from the SSR server's — any element rendering this from
// prefetched data must carry suppressHydrationWarning.
export function formatTimestamp(timestamp: string): string {
	return new Date(timestamp).toLocaleString('en-US');
}

export function formatTimestampShort(timestamp: string): string {
	const date = new Date(timestamp);
	return (
		date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
		' ' +
		date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
	);
}

export function polygonscanTxUrl(transactionHash: string): string {
	return `https://polygonscan.com/tx/${transactionHash}`;
}
