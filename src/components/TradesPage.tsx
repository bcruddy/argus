'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useTradesFilters } from '@/hooks/useTradesFilters';
import { useTrades, useInfiniteTrades, Trade } from '@/hooks/useTrades';
import { useFollowingTrades, useInfiniteFollowingTrades, useGroupedFollowingTrades } from '@/hooks/useFollowingTrades';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useGroupedTrades } from '@/hooks/useGroupedTrades';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { GroupedTradesView } from '@/components/GroupedTradesView';
import { FollowWalletButton } from '@/components/FollowWalletButton';
import { useFollowedWallets } from '@/hooks/useFollowedWallets';
import { WhaleSplash } from '@/components/WhaleSplash';
import {
	formatUsd,
	formatPrice,
	formatNumber,
	formatWallet,
	formatTimestamp,
	formatTimestampShort,
	polygonscanTxUrl,
} from '@/lib/format';
import {
	ChevronDown,
	ChevronUp,
	ChevronsUpDown,
	ExternalLink,
	List,
	Users,
	Star,
	RefreshCw,
	ArrowLeft,
} from 'lucide-react';

export type TradesScope = 'all' | 'following';

type ViewMode = 'individual' | 'grouped';

// /api/trades rows have no wallet label; /api/trades/following rows do.
type DisplayTrade = Trade & { wallet_label?: string | null };

const DESKTOP_LIMIT = 50;
const MOBILE_PAGE_SIZE = 20;
const MEGA_TRADE_THRESHOLD = 1_000_000;

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

function TradeCard({ trade }: { trade: DisplayTrade }) {
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
						<FollowWalletButton walletAddress={trade.proxy_wallet} />
						<span className="font-mono text-muted-foreground" title={trade.proxy_wallet}>
							{formatWallet(trade.proxy_wallet, trade.wallet_label)}
						</span>
					</div>
					<a
						href={polygonscanTxUrl(trade.transaction_hash)}
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

export function TradesPage({ scope }: { scope: TradesScope }) {
	const isAll = scope === 'all';
	const isMobile = useIsMobile();
	const router = useRouter();
	const { filters, setFilters, setMinAmount, toggleSort, isHydrated } = useTradesFilters();
	const { data: filterOptions } = useFilterOptions();
	const { data: followedWallets, isLoading: walletsLoading } = useFollowedWallets();
	const [viewMode, setViewMode] = useState<ViewMode>('individual');
	const [timeWindowHours, setTimeWindowHours] = useState(24);
	const [refreshing, setRefreshing] = useState(false);
	const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
	const [eventSearch, setEventSearch] = useState('');

	// Both scopes' queries are declared so hook order stays stable; the ones that
	// belong to the other scope are disabled and never fetch.
	const allQuery = useTrades(filters, DESKTOP_LIMIT, isAll);
	const allInfinite = useInfiniteTrades(filters, MOBILE_PAGE_SIZE, isAll);
	const allGrouped = useGroupedTrades(filters, timeWindowHours, DESKTOP_LIMIT, isAll);
	const followingQuery = useFollowingTrades(filters, DESKTOP_LIMIT, !isAll);
	const followingInfinite = useInfiniteFollowingTrades(filters, MOBILE_PAGE_SIZE, !isAll);
	const followingGrouped = useGroupedFollowingTrades(filters, timeWindowHours, DESKTOP_LIMIT, !isAll);

	// Desktop: single page of results. Mobile: infinite query.
	const listTrades = isAll ? allQuery.data?.trades : followingQuery.data?.trades;
	const trades: DisplayTrade[] = listTrades || [];
	const mobileTrades: DisplayTrade[] =
		(isAll
			? allInfinite.data?.pages.flatMap((page) => page.trades)
			: followingInfinite.data?.pages.flatMap((page) => page.trades)) || [];
	const groupedData = isAll ? allGrouped.data : followingGrouped.data;

	const hasNextPage = isAll ? allInfinite.hasNextPage : followingInfinite.hasNextPage;
	const isFetchingNextPage = isAll ? allInfinite.isFetchingNextPage : followingInfinite.isFetchingNextPage;
	const fetchNextPage = isAll ? allInfinite.fetchNextPage : followingInfinite.fetchNextPage;

	// Intersection observer for infinite scroll sentinel
	const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({
		rootMargin: '200px',
		enabled: isMobile && viewMode === 'individual' && hasNextPage && !isFetchingNextPage,
	});

	// Fetch next page when sentinel is visible
	useEffect(() => {
		if (isIntersecting && hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [isIntersecting, hasNextPage, isFetchingNextPage, fetchNextPage]);

	// Whale splash animation state
	const [showWhale, setShowWhale] = useState(false);
	const [megaTradeAmount, setMegaTradeAmount] = useState(0);
	const hasShownWhaleRef = useRef(false);

	// Detect mega trades ($1M+) and show whale animation (main view only)
	useEffect(() => {
		if (!isAll || hasShownWhaleRef.current || !listTrades?.length) return;

		const megaTrade = listTrades.find((t) => t.usdc_value >= MEGA_TRADE_THRESHOLD);
		if (megaTrade) {
			hasShownWhaleRef.current = true;
			setMegaTradeAmount(megaTrade.usdc_value);
			setShowWhale(true);
		}
	}, [isAll, listTrades]);

	const handleRefresh = async () => {
		setRefreshing(true);
		try {
			// Only the main view pulls new trades from Polymarket; /following just re-reads.
			if (isAll) {
				const res = await fetch('/api/ingest', { method: 'POST' });
				if (!res.ok) throw new Error('Failed to ingest trades');
				setLastRefresh(new Date());
				await Promise.all([allQuery.refetch(), allGrouped.refetch(), allInfinite.refetch()]);
			} else {
				await Promise.all([followingQuery.refetch(), followingGrouped.refetch(), followingInfinite.refetch()]);
			}
		} catch (err) {
			console.error('Refresh error:', err);
		} finally {
			setRefreshing(false);
		}
	};

	// Mobile uses infinite query, desktop uses regular query
	const listError = isAll ? allQuery.error : followingQuery.error;
	const listLoading = isAll ? allQuery.isLoading : followingQuery.isLoading;
	const infiniteError = isAll ? allInfinite.error : followingInfinite.error;
	const infiniteLoading = isAll ? allInfinite.isLoading : followingInfinite.isLoading;
	const groupedError = isAll ? allGrouped.error : followingGrouped.error;
	const groupedLoading = isAll ? allGrouped.isLoading : followingGrouped.isLoading;

	const mobileError = viewMode === 'individual' ? infiniteError : groupedError;
	const mobileLoading = viewMode === 'individual' ? infiniteLoading : groupedLoading;
	const desktopError = viewMode === 'individual' ? listError : groupedError;
	const desktopLoading = viewMode === 'individual' ? listLoading : groupedLoading;

	const currentError = isMobile ? mobileError : desktopError;
	const currentLoading = isMobile ? mobileLoading : desktopLoading;

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
	if (!isAll && !walletsLoading && followedCount === 0) {
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
			{/* Whale splash animation for mega trades */}
			{showWhale && <WhaleSplash amount={megaTradeAmount} onDismiss={() => setShowWhale(false)} />}

			<Card>
				<CardHeader className="pb-4">
					<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
						<div>
							{isAll ? (
								<>
									<CardTitle className="text-lg md:text-xl">Whale Trades</CardTitle>
									<CardDescription className="text-xs md:text-sm">
										Large trades from Polymarket
										{lastRefresh && <span className="ml-2">Last refresh: {lastRefresh.toLocaleTimeString()}</span>}
									</CardDescription>
								</>
							) : (
								<>
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
								</>
							)}
						</div>
						<div className="flex items-center gap-2">
							{/* Mobile (main view only): Dropdown for view selection */}
							{isAll && isMobile ? (
								<Select
									value={viewMode}
									onValueChange={(value) => {
										if (value === 'following') {
											router.push('/following');
										} else {
											setViewMode(value as ViewMode);
										}
									}}
								>
									<SelectTrigger className="w-[140px] h-8">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="individual">
											<span className="flex items-center gap-2">
												<List className="h-3 w-3" />
												Individual
											</span>
										</SelectItem>
										<SelectItem value="grouped">
											<span className="flex items-center gap-2">
												<Users className="h-3 w-3" />
												By Wallet
											</span>
										</SelectItem>
										{followedCount > 0 && (
											<SelectItem value="following">
												<span className="flex items-center gap-2">
													<Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
													Following ({followedCount})
												</span>
											</SelectItem>
										)}
									</SelectContent>
								</Select>
							) : (
								<>
									{/* Button group for view mode */}
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
									{isAll && followedCount > 0 && (
										<Link href="/following">
											<Button variant="outline" size="sm" className="gap-1">
												<Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
												Following ({followedCount})
											</Button>
										</Link>
									)}
								</>
							)}
							{isAll ? (
								<Button onClick={handleRefresh} disabled={refreshing} size="sm" className="gap-1">
									<RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
									<span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
								</Button>
							) : (
								<Button onClick={handleRefresh} size="sm">
									Refresh
								</Button>
							)}
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
					) : (isMobile ? mobileTrades.length === 0 : trades.length === 0) ? (
						<div className="text-muted-foreground py-8 text-center text-sm">
							{isAll
								? 'No whale trades found. Click Refresh to fetch from Polymarket.'
								: 'No trades found from followed wallets matching your filters.'}
						</div>
					) : isMobile ? (
						// Mobile: Card layout with infinite scroll
						<div>
							{mobileTrades.map((trade) => (
								<TradeCard key={trade.id} trade={trade} />
							))}

							{/* Infinite scroll sentinel */}
							<div ref={sentinelRef} className="h-4" aria-hidden="true" />

							{/* Loading indicator for next page */}
							{isFetchingNextPage && (
								<div className="py-4 text-center text-sm text-muted-foreground">Loading more trades...</div>
							)}

							{/* End of results indicator */}
							{!hasNextPage && mobileTrades.length > 0 && (
								<div className="py-4 text-center text-xs text-muted-foreground">No more trades to load</div>
							)}
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
													<FollowWalletButton walletAddress={trade.proxy_wallet} />
													<span className="font-mono text-sm" title={trade.proxy_wallet}>
														{formatWallet(trade.proxy_wallet, trade.wallet_label)}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<a
													href={polygonscanTxUrl(trade.transaction_hash)}
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

					{/* Results count (only for individual view on desktop) */}
					{viewMode === 'individual' && !isMobile && trades.length > 0 && (
						<div className="mt-4 text-xs text-muted-foreground text-center">Showing {trades.length} trades</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
