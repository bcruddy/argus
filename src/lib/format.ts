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

// GroupedTradesView used maximumFractionDigits: 4 while both pages used 2, so the
// same price rendered differently depending on the view. Unified on 2.
const priceFormatter = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
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

export function formatTimestamp(timestamp: string): string {
	return new Date(timestamp).toLocaleString();
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
