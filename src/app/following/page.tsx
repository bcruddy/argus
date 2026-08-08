'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useTradesFilters } from '@/hooks/useTradesFilters';
import { useFollowingTrades, FollowingTrade } from '@/hooks/useFollowingTrades';
import { useGroupedFollowingTrades } from '@/hooks/useFollowingTrades';
import { useFollowedWallets } from '@/hooks/useFollowedWallets';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { GroupedTradesView } from '@/components/GroupedTradesView';
import { FollowWalletButton } from '@/components/FollowWalletButton';
import { ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, List, Users, ArrowLeft, Star } from 'lucide-react';

type ViewMode = 'individual' | 'grouped';

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

function formatWallet(wallet: string, label?: string | null): string {
	if (label) return label;
	if (wallet.length <= 10) return wallet;
	return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function formatTimestamp(timestamp: string): string {
	return new Date(timestamp).toLocaleString();
}

function formatTimestampShort(timestamp: string): string {
	const date = new Date(timestamp);
	return (
		date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
		' ' +
		date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
	);
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

function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768);
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	return isMobile;
}

function TradeCard({ trade }: { trade: FollowingTrade }) {
	return (
		<Card className="mb-3">
			<CardContent className="pt-4 pb-3 px-4">
				<div className="flex justify-between items-start mb-2">
					<div className="flex-1 min-w-0 mr-2">
						<p className="text-sm font-medium truncate" title={trade.title || trade.condition_id}>
							{trade.title || (
								<span className="text-muted-foreground italic">{trade.condition_id.slice(0, 16)}...</span>
							)}
						</p>
						<p className="text-xs text-muted-foreground">{formatTimestampShort(trade.trade_timestamp)}</p>
					</div>
					<Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'} className="shrink-0">
						{trade.side}
					</Badge>
				</div>
				<div className="grid grid-cols-2 gap-2 text-sm">
					<div>
						<span className="text-muted-foreground">Amount:</span>
						<span className="font-mono font-medium ml-1">{formatUsd(trade.usdc_value)}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Outcome:</span>
						<span className="ml-1">{trade.outcome || '-'}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Size:</span>
						<span className="font-mono ml-1">{formatNumber(trade.size)}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Price:</span>
						<span className="font-mono ml-1">{formatPrice(trade.price)}</span>
					</div>
				</div>
				<div className="mt-2 flex justify-between items-center text-xs">
					<div className="flex items-center gap-1">
						<FollowWalletButton walletAddress={trade.proxy_wallet} variant="icon" />
						<span className="font-mono text-muted-foreground" title={trade.proxy_wallet}>
							{formatWallet(trade.proxy_wallet, trade.wallet_label)}
						</span>
					</div>
					<a
						href={`https://polygonscan.com/tx/${trade.transaction_hash}`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline flex items-center gap-1"
					>
						View Tx <ExternalLink className="h-3 w-3" />
					</a>
				</div>
			</CardContent>
		</Card>
	);
}

function FollowingContent() {
	const isMobile = useIsMobile();
	const { filters, setFilters, setMinAmount, toggleSort, isHydrated } = useTradesFilters();
	const { data: filterOptions } = useFilterOptions();
	const { data: followedWallets, isLoading: walletsLoading } = useFollowedWallets();
	const limit = isMobile ? 10 : 50;
	const [viewMode, setViewMode] = useState<ViewMode>('individual');
	const [timeWindowHours, setTimeWindowHours] = useState(24);
	const { data, isLoading, error, refetch } = useFollowingTrades(filters, limit);
	const {
		data: groupedData,
		isLoading: groupedLoading,
		error: groupedError,
		refetch: refetchGrouped,
	} = useGroupedFollowingTrades(filters, timeWindowHours, limit);
	const [eventSearch, setEventSearch] = useState('');

	const currentError = viewMode === 'individual' ? error : groupedError;
	const currentLoading = viewMode === 'individual' ? isLoading : groupedLoading;

	const trades = data?.trades || [];
	const followedCount = followedWallets?.wallets?.length || 0;

	const handleMinAmountChange = (value: number[]) => {
		setMinAmount(value[0]);
	};

	const handleEventSearch = (e: React.FormEvent) => {
		e.preventDefault();
		setFilters({ event: eventSearch || null });
	};

	const clearEventSearch = () => {
		setEventSearch('');
		setFilters({ event: null });
	};

	// Show empty state if no wallets followed
	if (!walletsLoading && followedCount === 0) {
		return (
			<div className="container mx-auto py-4 md:py-8 px-3 md:px-4">
				<Card>
					<CardContent className="py-12">
						<div className="text-center">
							<Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
							<h2 className="text-xl font-semibold mb-2">No wallets followed yet</h2>
							<p className="text-muted-foreground mb-4">
								Start following wallets from the main trades view to see their activity here.
							</p>
							<Link href="/">
								<Button>
									<ArrowLeft className="h-4 w-4 mr-2" />
									Go to Whale Trades
								</Button>
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-4 md:py-8 px-3 md:px-4">
			<Card>
				<CardHeader className="pb-4">
					<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
						<div>
							<div className="flex items-center gap-2 mb-1">
								<Link href="/" className="text-muted-foreground hover:text-foreground">
									<ArrowLeft className="h-4 w-4" />
								</Link>
								<CardTitle className="text-lg md:text-xl flex items-center gap-2">
									<Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
									Following
								</CardTitle>
							</div>
							<CardDescription className="text-xs md:text-sm">
								Trades from {followedCount} followed wallet{followedCount !== 1 ? 's' : ''}
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							{/* View Mode Toggle */}
							<div className="flex rounded-lg border p-1">
								<Button
									variant={viewMode === 'individual' ? 'default' : 'ghost'}
									size="sm"
									onClick={() => setViewMode('individual')}
									className="h-7 px-2 text-xs"
								>
									<List className="h-3 w-3 mr-1" />
									Individual
								</Button>
								<Button
									variant={viewMode === 'grouped' ? 'default' : 'ghost'}
									size="sm"
									onClick={() => setViewMode('grouped')}
									className="h-7 px-2 text-xs"
								>
									<Users className="h-3 w-3 mr-1" />
									By Wallet
								</Button>
							</div>
							<Button onClick={() => Promise.all([refetch(), refetchGrouped()])} size="sm">
								Refresh
							</Button>
						</div>
					</div>

					{/* Filters */}
					<div className="mt-4 space-y-4">
						{/* Category and Event filters */}
						<div className="flex flex-col sm:flex-row gap-3">
							<div className="flex-1">
								<label className="text-xs text-muted-foreground mb-1 block">Category</label>
								<Select
									value={filters.category || ''}
									onValueChange={(value) => setFilters({ category: value === 'all' ? null : value })}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="All Categories" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Categories</SelectItem>
										{filterOptions?.categories.map((cat) => (
											<SelectItem key={cat} value={cat}>
												{cat}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex-1">
								<label className="text-xs text-muted-foreground mb-1 block">Event Search</label>
								<form onSubmit={handleEventSearch} className="flex gap-2">
									<Input
										type="text"
										placeholder="Search events..."
										value={eventSearch}
										onChange={(e) => setEventSearch(e.target.value)}
										className="flex-1"
									/>
									{filters.event && (
										<Button type="button" variant="ghost" size="sm" onClick={clearEventSearch}>
											Clear
										</Button>
									)}
								</form>
							</div>
						</div>

						{/* Min Amount Slider */}
						<div>
							<div className="flex justify-between items-center mb-2">
								<label className="text-xs text-muted-foreground">Minimum Amount</label>
								<span className="text-sm font-mono font-medium">
									{isHydrated ? formatUsd(filters.minAmount) : formatUsd(250000)}
								</span>
							</div>
							<Slider
								value={[filters.minAmount]}
								onValueChange={handleMinAmountChange}
								min={10000}
								max={1000000}
								step={10000}
								className="w-full"
							/>
							<div className="flex justify-between text-xs text-muted-foreground mt-1">
								<span>$10k</span>
								<span>$1M</span>
							</div>
						</div>

						{/* Time Window (only for grouped view) */}
						{viewMode === 'grouped' && (
							<div>
								<label className="text-xs text-muted-foreground mb-1 block">Time Window</label>
								<Select
									value={String(timeWindowHours)}
									onValueChange={(value) => setTimeWindowHours(parseInt(value, 10))}
								>
									<SelectTrigger className="w-full sm:w-[200px]">
										<SelectValue placeholder="Select time window" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="6">Last 6 hours</SelectItem>
										<SelectItem value="12">Last 12 hours</SelectItem>
										<SelectItem value="24">Last 24 hours</SelectItem>
										<SelectItem value="48">Last 48 hours</SelectItem>
										<SelectItem value="72">Last 72 hours</SelectItem>
										<SelectItem value="168">Last 7 days</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{currentError && <div className="text-destructive mb-4 text-sm">Error: {currentError.message}</div>}

					{currentLoading ? (
						<div className="text-muted-foreground py-8 text-center text-sm">
							Loading {viewMode === 'grouped' ? 'grouped ' : ''}trades...
						</div>
					) : viewMode === 'grouped' ? (
						// Grouped view
						<GroupedTradesView
							groups={groupedData?.groups || []}
							isMobile={isMobile}
							timeWindowHours={timeWindowHours}
							totalTrades={groupedData?.meta.totalTrades || 0}
						/>
					) : trades.length === 0 ? (
						<div className="text-muted-foreground py-8 text-center text-sm">
							No trades found from followed wallets matching your filters.
						</div>
					) : isMobile ? (
						// Mobile: Card layout
						<div>
							{trades.map((trade) => (
								<TradeCard key={trade.id} trade={trade} />
							))}
						</div>
					) : (
						// Desktop: Table layout
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
											<TableCell>
												<div className="flex items-center gap-1">
													<FollowWalletButton walletAddress={trade.proxy_wallet} variant="icon" />
													<span className="font-mono text-sm" title={trade.proxy_wallet}>
														{formatWallet(trade.proxy_wallet, trade.wallet_label)}
													</span>
												</div>
											</TableCell>
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

					{/* Results count (only for individual view) */}
					{viewMode === 'individual' && trades.length > 0 && (
						<div className="mt-4 text-xs text-muted-foreground text-center">
							Showing {trades.length} trades {isMobile && '(limited on mobile)'}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export default function FollowingPage() {
	return (
		<Suspense fallback={<div className="container mx-auto py-8 px-4 text-center">Loading...</div>}>
			<FollowingContent />
		</Suspense>
	);
}
