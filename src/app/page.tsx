'use client';

import { Suspense, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTradesFilters } from '@/hooks/useTradesFilters';
import { useTrades } from '@/hooks/useTrades';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

function formatUsd(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

function formatPrice(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

function formatWallet(wallet: string): string {
	if (wallet.length <= 10) return wallet;
	return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function formatTimestamp(timestamp: string): string {
	return new Date(timestamp).toLocaleString();
}

function SortIcon({ field, currentSort, currentOrder }: { field: string; currentSort: string; currentOrder: string }) {
	if (currentSort !== field) {
		return <ChevronsUpDown className="ml-1 inline h-4 w-4 text-muted-foreground" />;
	}
	return currentOrder === 'desc' ? (
		<ChevronDown className="ml-1 inline h-4 w-4" />
	) : (
		<ChevronUp className="ml-1 inline h-4 w-4" />
	);
}

function TradesTableContent() {
	const { filters, toggleSort } = useTradesFilters();
	const { data, isLoading, error, refetch } = useTrades(filters);
	const [refreshing, setRefreshing] = useState(false);
	const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

	const handleRefresh = async () => {
		setRefreshing(true);
		try {
			const res = await fetch('/api/ingest', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to ingest trades');
			setLastRefresh(new Date());
			await refetch();
		} catch (err) {
			console.error('Refresh error:', err);
		} finally {
			setRefreshing(false);
		}
	};

	const trades = data?.trades || [];

	return (
		<div className="container mx-auto py-8 px-4">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Whale Trades</CardTitle>
							<CardDescription>
								Trades over $250k from Polymarket
								{lastRefresh && <span className="ml-2">Last refresh: {lastRefresh.toLocaleTimeString()}</span>}
							</CardDescription>
						</div>
						<Button onClick={handleRefresh} disabled={refreshing}>
							{refreshing ? 'Refreshing...' : 'Refresh'}
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{error && <div className="text-destructive mb-4 text-sm">Error: {error.message}</div>}

					{isLoading ? (
						<div className="text-muted-foreground py-8 text-center">Loading trades...</div>
					) : trades.length === 0 ? (
						<div className="text-muted-foreground py-8 text-center">
							No whale trades found. Click Refresh to fetch from Polymarket.
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="min-w-[200px]">Event</TableHead>
										<TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('time')}>
											Time
											<SortIcon field="time" currentSort={filters.sort} currentOrder={filters.order} />
										</TableHead>
										<TableHead>Side</TableHead>
										<TableHead>Outcome</TableHead>
										<TableHead className="text-right">Size</TableHead>
										<TableHead className="text-right">Price</TableHead>
										<TableHead
											className="text-right cursor-pointer hover:bg-muted/50"
											onClick={() => toggleSort('amount')}
										>
											Amount
											<SortIcon field="amount" currentSort={filters.sort} currentOrder={filters.order} />
										</TableHead>
										<TableHead>Wallet</TableHead>
										<TableHead>Tx</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{trades.map((trade) => (
										<TableRow key={trade.id}>
											<TableCell className="max-w-[300px]">
												<div className="truncate" title={trade.title || trade.condition_id}>
													{trade.title || (
														<span className="text-muted-foreground italic">{trade.condition_id.slice(0, 16)}...</span>
													)}
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
												{formatTimestamp(trade.trade_timestamp)}
											</TableCell>
											<TableCell>
												<Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'}>{trade.side}</Badge>
											</TableCell>
											<TableCell>{trade.outcome || '-'}</TableCell>
											<TableCell className="text-right font-mono text-sm">{formatNumber(trade.size)}</TableCell>
											<TableCell className="text-right font-mono text-sm">{formatPrice(trade.price)}</TableCell>
											<TableCell className="text-right font-mono font-medium">{formatUsd(trade.usdc_value)}</TableCell>
											<TableCell className="font-mono text-sm">{formatWallet(trade.proxy_wallet)}</TableCell>
											<TableCell>
												<a
													href={`https://polygonscan.com/tx/${trade.transaction_hash}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary hover:underline text-sm"
												>
													View
												</a>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export default function Home() {
	return (
		<Suspense fallback={<div className="container mx-auto py-8 px-4 text-center">Loading...</div>}>
			<TradesTableContent />
		</Suspense>
	);
}
