'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { UserButton } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useTradesFilters, type SortField } from '@/hooks/useTradesFilters';
import { useTrades, useInfiniteTrades, Trade } from '@/hooks/useTrades';
import { useFollowingTrades, useInfiniteFollowingTrades, useGroupedFollowingTrades } from '@/hooks/useFollowingTrades';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useGroupedTrades } from '@/hooks/useGroupedTrades';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { useIsMobileViewport, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { GroupedTradesView } from '@/components/GroupedTradesView';
import { FollowWalletButton } from '@/components/FollowWalletButton';
import { useFollowedWallets } from '@/hooks/useFollowedWallets';
import { WhaleSplash } from '@/components/WhaleSplash';
import {
	DESKTOP_LIMIT,
	MOBILE_PAGE_SIZE,
	DEFAULT_MIN_AMOUNT,
	infiniteFollowingTradesQueryKey,
	infiniteTradesQueryKey,
} from '@/lib/queryKeys';
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

// A real button inside the th: keyboard users could not sort at all when this was an
// onClick on the cell, and aria-sort is what announces the current direction.
function SortableHead({
	field,
	label,
	sort,
	order,
	onToggle,
	align = 'left',
}: {
	field: SortField;
	label: string;
	sort: SortField;
	order: string;
	onToggle: (field: SortField) => void;
	align?: 'left' | 'right';
}) {
	const isActive = sort === field;
	return (
		<TableHead aria-sort={isActive ? (order === 'desc' ? 'descending' : 'ascending') : 'none'} className="p-0">
			<button
				type="button"
				onClick={() => onToggle(field)}
				className={`hover:bg-muted/50 flex h-10 w-full cursor-pointer items-center px-2 font-medium ${
					align === 'right' ? 'justify-end' : ''
				}`}
			>
				{label}
				<SortIcon field={field} currentSort={sort} currentOrder={order} />
			</button>
		</TableHead>
	);
}

function ViewModeButtons({ viewMode, onChange }: { viewMode: ViewMode; onChange: (mode: ViewMode) => void }) {
	return (
		<div className="flex rounded-lg border p-1">
			<Button
				variant={viewMode === 'individual' ? 'default' : 'ghost'}
				size="sm"
				onClick={() => onChange('individual')}
				aria-pressed={viewMode === 'individual'}
				className="h-7 px-2 text-xs"
			>
				<List className="h-3 w-3 mr-1" />
				Individual
			</Button>
			<Button
				variant={viewMode === 'grouped' ? 'default' : 'ghost'}
				size="sm"
				onClick={() => onChange('grouped')}
				aria-pressed={viewMode === 'grouped'}
				className="h-7 px-2 text-xs"
			>
				<Users className="h-3 w-3 mr-1" />
				By Wallet
			</Button>
		</div>
	);
}

function FollowingLink({ followedCount }: { followedCount: number }) {
	return (
		<Link href="/following">
			<Button variant="outline" size="sm" className="gap-1">
				<Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
				Following ({followedCount})
			</Button>
		</Link>
	);
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
						aria-label={`View transaction ${trade.transaction_hash.slice(0, 10)} on Polygonscan (opens in a new tab)`}
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
	const router = useRouter();
	const queryClient = useQueryClient();
	// Layout is CSS (`md:hidden` / `hidden md:block`); this only decides which query is
	// allowed to fetch, and is null until hydration so neither fires speculatively.
	const isMobile = useIsMobileViewport();
	const prefersReducedMotion = usePrefersReducedMotion();
	const { filters, setFilters, setMinAmount, toggleSort, isHydrated } = useTradesFilters();
	const { data: filterOptions } = useFilterOptions();
	const { data: followedWallets, isLoading: walletsLoading } = useFollowedWallets();
	const [viewMode, setViewMode] = useState<ViewMode>('individual');
	const [timeWindowHours, setTimeWindowHours] = useState(24);
	const [refreshing, setRefreshing] = useState(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);
	const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
	const [eventSearch, setEventSearch] = useState('');
	// Slider position while dragging. Only the committed value drives a query — the
	// drag used to push every 10k step through the query key (~99 refetches per drag).
	const [dragMinAmount, setDragMinAmount] = useState<number | null>(null);

	// Both scopes' queries are declared so hook order stays stable; only the one that
	// matches this scope, this view mode and this viewport is ever enabled.
	const wantsList = viewMode === 'individual';
	const wantsDesktopList = wantsList && isMobile === false;
	const wantsMobileList = wantsList && isMobile === true;
	const wantsGrouped = viewMode === 'grouped';

	const allQuery = useTrades(filters, DESKTOP_LIMIT, isAll && wantsDesktopList);
	const allInfinite = useInfiniteTrades(filters, MOBILE_PAGE_SIZE, isAll && wantsMobileList);
	const allGrouped = useGroupedTrades(filters, timeWindowHours, DESKTOP_LIMIT, isAll && wantsGrouped);
	const followingQuery = useFollowingTrades(filters, DESKTOP_LIMIT, !isAll && wantsDesktopList);
	const followingInfinite = useInfiniteFollowingTrades(filters, MOBILE_PAGE_SIZE, !isAll && wantsMobileList);
	const followingGrouped = useGroupedFollowingTrades(filters, timeWindowHours, DESKTOP_LIMIT, !isAll && wantsGrouped);

	const listQuery = isAll ? allQuery : followingQuery;
	const infiniteQuery = isAll ? allInfinite : followingInfinite;
	const groupedQuery = isAll ? allGrouped : followingGrouped;

	// Desktop: single page of results. Mobile: infinite query.
	const listTrades = listQuery.data?.trades;
	const trades: DisplayTrade[] = listTrades || [];
	const mobileTrades: DisplayTrade[] = infiniteQuery.data?.pages.flatMap((page) => page.trades) || [];
	const groupedData = groupedQuery.data;

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = infiniteQuery;

	// Intersection observer for infinite scroll sentinel
	const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({
		rootMargin: '200px',
		enabled: wantsMobileList && hasNextPage && !isFetchingNextPage,
	});

	// Fetch next page when sentinel is visible
	useEffect(() => {
		if (isIntersecting && hasNextPage && !isFetchingNextPage) {
			// React Query surfaces the failure through the query's error state, so there is
			// nothing for this effect to catch.
			void fetchNextPage();
		}
	}, [isIntersecting, hasNextPage, isFetchingNextPage, fetchNextPage]);

	// Whale splash animation state
	const [showWhale, setShowWhale] = useState(false);
	const [megaTradeAmount, setMegaTradeAmount] = useState(0);
	const hasShownWhaleRef = useRef(false);

	// Detect mega trades ($1M+) and show whale animation (main view only, and never
	// for a viewer who asked for reduced motion — it translates across the viewport).
	useEffect(() => {
		if (!isAll || prefersReducedMotion !== false || hasShownWhaleRef.current || !listTrades?.length) return;

		const megaTrade = listTrades.find((t) => t.usdc_value >= MEGA_TRADE_THRESHOLD);
		if (megaTrade) {
			hasShownWhaleRef.current = true;
			setMegaTradeAmount(megaTrade.usdc_value);
			setShowWhale(true);
		}
	}, [isAll, listTrades, prefersReducedMotion]);

	const handleRefresh = async () => {
		setRefreshing(true);
		setRefreshError(null);
		try {
			// Only the main view pulls new trades from Polymarket; /following just re-reads.
			if (isAll) {
				const res = await fetch('/api/ingest', { method: 'POST' });
				if (!res.ok) throw new Error('Failed to ingest trades');
				setLastRefresh(new Date());
			}

			// Refetch only what is on screen. Refetching all three re-ran two invisible
			// queries, and for the infinite list re-ran every page the user had scrolled.
			if (wantsGrouped) {
				await groupedQuery.refetch();
			} else if (isMobile) {
				// reset, not refetch: collapse back to page 1 instead of re-requesting
				// every accumulated page.
				await queryClient.resetQueries({
					queryKey: isAll
						? infiniteTradesQueryKey(filters, MOBILE_PAGE_SIZE)
						: infiniteFollowingTradesQueryKey(filters, MOBILE_PAGE_SIZE),
				});
			} else {
				await listQuery.refetch();
			}
		} catch (err) {
			setRefreshError(err instanceof Error ? err.message : 'Refresh failed');
		} finally {
			setRefreshing(false);
		}
	};

	// isPending, not isLoading: a query gated off until hydration is not "loaded and
	// empty", and rendering the empty state for it would flash "No trades found".
	const listError = listQuery.error;
	const listPending = listQuery.isPending;
	const infiniteError = infiniteQuery.error;
	const infinitePending = infiniteQuery.isPending;
	const groupedError = groupedQuery.error;
	const groupedPending = groupedQuery.isPending;

	const followedCount = followedWallets?.wallets?.length || 0;
	const displayMinAmount = dragMinAmount ?? filters.minAmount;
	const emptyMessage = isAll
		? 'No whale trades found. Click Refresh to fetch from Polymarket.'
		: 'No trades found from followed wallets matching your filters.';

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
										<Link
											href="/"
											className="text-muted-foreground hover:text-foreground"
											aria-label="Back to whale trades"
										>
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
							{/* Mobile (main view only): dropdown for view selection. Chosen by CSS so
							    a phone does not paint the desktop control first. */}
							<div className="md:hidden">
								{isAll ? (
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
										<SelectTrigger className="w-[140px] h-8" aria-label="View mode">
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
									<ViewModeButtons viewMode={viewMode} onChange={setViewMode} />
								)}
							</div>
							<div className="hidden md:flex md:items-center md:gap-2">
								<ViewModeButtons viewMode={viewMode} onChange={setViewMode} />
								{isAll && followedCount > 0 && <FollowingLink followedCount={followedCount} />}
							</div>
							{isAll ? (
								<Button onClick={() => void handleRefresh()} disabled={refreshing} size="sm" className="gap-1">
									<RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
									<span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
								</Button>
							) : (
								<Button onClick={() => void handleRefresh()} disabled={refreshing} size="sm">
									{refreshing ? 'Refreshing...' : 'Refresh'}
								</Button>
							)}
							<UserButton />
						</div>
					</div>

					{/* A failed refresh used to be console-only, indistinguishable from "no new
					    trades". */}
					{refreshError && (
						<p role="alert" className="text-destructive mt-2 text-xs md:text-right">
							Refresh failed: {refreshError}
						</p>
					)}

					{/* Filters */}
					<div className="mt-4 space-y-4">
						{/* Category and Event filters */}
						<div className="flex flex-col sm:flex-row gap-3">
							<div className="flex-1">
								<label htmlFor="filter-category" className="text-xs text-muted-foreground mb-1 block">
									Category
								</label>
								<Select
									value={filters.category || ''}
									onValueChange={(value) => setFilters({ category: value === 'all' ? null : value })}
								>
									<SelectTrigger id="filter-category" className="w-full">
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
								<label htmlFor="filter-event" className="text-xs text-muted-foreground mb-1 block">
									Event Search
								</label>
								<form onSubmit={handleEventSearch} className="flex gap-2">
									<Input
										id="filter-event"
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
								{/* A span, not a label: the thing that takes focus is the Radix thumb,
								    which htmlFor cannot target — it is wired up with aria-labelledby. */}
								<span id="filter-min-amount-label" className="text-xs text-muted-foreground">
									Minimum Amount
								</span>
								<span className="text-sm font-mono font-medium">
									{isHydrated ? formatUsd(displayMinAmount) : formatUsd(DEFAULT_MIN_AMOUNT)}
								</span>
							</div>
							<Slider
								value={[displayMinAmount]}
								aria-labelledby="filter-min-amount-label"
								// onValueChange only moves the readout; onValueCommit (which Radix
								// fires for pointer release and each keyboard step) is what refetches.
								// Single-thumb slider, so Radix always emits exactly one value; ignore
								// the event rather than guess if that ever stops being true.
								onValueChange={([next]) => {
									if (next !== undefined) setDragMinAmount(next);
								}}
								onValueCommit={([next]) => {
									if (next === undefined) return;
									setMinAmount(next);
									setDragMinAmount(null);
								}}
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
								<label htmlFor="filter-time-window" className="text-xs text-muted-foreground mb-1 block">
									Time Window
								</label>
								<Select
									value={String(timeWindowHours)}
									onValueChange={(value) => setTimeWindowHours(parseInt(value, 10))}
								>
									<SelectTrigger id="filter-time-window" className="w-full sm:w-[200px]">
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
					{viewMode === 'grouped' ? (
						<>
							{groupedError && (
								<div role="alert" className="text-destructive mb-4 text-sm">
									Error: {groupedError.message}
								</div>
							)}
							{groupedPending ? (
								<div role="status" className="text-muted-foreground py-8 text-center text-sm">
									Loading grouped trades...
								</div>
							) : (
								<GroupedTradesView
									groups={groupedData?.groups || []}
									timeWindowHours={timeWindowHours}
									totalTrades={groupedData?.meta.totalTrades || 0}
								/>
							)}
						</>
					) : (
						<>
							{/* Desktop: table layout */}
							<div className="hidden md:block">
								{listError && (
									<div role="alert" className="text-destructive mb-4 text-sm">
										Error: {listError.message}
									</div>
								)}
								{listPending ? (
									<div role="status" className="text-muted-foreground py-8 text-center text-sm">
										Loading trades...
									</div>
								) : trades.length === 0 ? (
									<div className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</div>
								) : (
									<>
										<div className="overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="min-w-[200px]">Event</TableHead>
														<SortableHead
															field="time"
															label="Time"
															sort={filters.sort}
															order={filters.order}
															onToggle={toggleSort}
														/>
														<TableHead>Side</TableHead>
														<TableHead>Outcome</TableHead>
														<TableHead className="text-right">Size</TableHead>
														<TableHead className="text-right">Price</TableHead>
														<SortableHead
															field="amount"
															label="Amount"
															sort={filters.sort}
															order={filters.order}
															onToggle={toggleSort}
															align="right"
														/>
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
																		<span className="text-muted-foreground italic">
																			{trade.condition_id.slice(0, 16)}...
																		</span>
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
															<TableCell className="text-right font-mono font-medium">
																{formatUsd(trade.usdc_value)}
															</TableCell>
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
																	aria-label={`View transaction ${trade.transaction_hash.slice(0, 10)} on Polygonscan (opens in a new tab)`}
																>
																	View
																</a>
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>
										<div className="mt-4 text-xs text-muted-foreground text-center">Showing {trades.length} trades</div>
									</>
								)}
							</div>

							{/* Mobile: card layout with infinite scroll */}
							<div className="md:hidden">
								{infiniteError && (
									<div role="alert" className="text-destructive mb-4 text-sm">
										Error: {infiniteError.message}
									</div>
								)}
								{infinitePending ? (
									<div role="status" className="text-muted-foreground py-8 text-center text-sm">
										Loading trades...
									</div>
								) : mobileTrades.length === 0 ? (
									<div className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</div>
								) : (
									<div>
										{mobileTrades.map((trade) => (
											<TradeCard key={trade.id} trade={trade} />
										))}

										{/* Infinite scroll sentinel */}
										<div ref={sentinelRef} className="h-4" aria-hidden="true" />

										{/* Loading indicator for next page */}
										{isFetchingNextPage && (
											<div role="status" className="py-4 text-center text-sm text-muted-foreground">
												Loading more trades...
											</div>
										)}

										{/* End of results indicator */}
										{!hasNextPage && mobileTrades.length > 0 && (
											<div className="py-4 text-center text-xs text-muted-foreground">No more trades to load</div>
										)}
									</div>
								)}
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
