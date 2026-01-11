'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Trade {
	id: string;
	transaction_hash: string;
	condition_id: string;
	outcome: string | null;
	proxy_wallet: string;
	side: 'BUY' | 'SELL';
	size: number;
	price: number;
	usdc_value: number;
	trade_timestamp: string;
	detection_rule: string | null;
}

function formatUsd(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
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

export default function Home() {
	const [trades, setTrades] = useState<Trade[]>([]);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

	const fetchTrades = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/trades?limit=50');
			if (!res.ok) throw new Error('Failed to fetch trades');
			const data = await res.json();
			setTrades(data.trades || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	}, []);

	const handleRefresh = async () => {
		setRefreshing(true);
		setError(null);
		try {
			const res = await fetch('/api/ingest', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to ingest trades');
			const result = await res.json();
			console.log('Ingestion result:', result);
			setLastRefresh(new Date());
			await fetchTrades();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setRefreshing(false);
		}
	};

	useEffect(() => {
		fetchTrades();
	}, [fetchTrades]);

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
					{error && <div className="text-destructive mb-4 text-sm">Error: {error}</div>}

					{loading ? (
						<div className="text-muted-foreground py-8 text-center">Loading trades...</div>
					) : trades.length === 0 ? (
						<div className="text-muted-foreground py-8 text-center">
							No whale trades found. Click Refresh to fetch from Polymarket.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Time</TableHead>
									<TableHead>Side</TableHead>
									<TableHead>Outcome</TableHead>
									<TableHead className="text-right">Amount</TableHead>
									<TableHead>Wallet</TableHead>
									<TableHead>Tx</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{trades.map((trade) => (
									<TableRow key={trade.id}>
										<TableCell className="text-muted-foreground text-sm">
											{formatTimestamp(trade.trade_timestamp)}
										</TableCell>
										<TableCell>
											<Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'}>{trade.side}</Badge>
										</TableCell>
										<TableCell>{trade.outcome || '-'}</TableCell>
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
					)}
				</CardContent>
			</Card>
		</div>
	);
}
