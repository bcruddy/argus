'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TradeGroup, TradeGroupType } from '@/schemas/api';
import { ChevronDown, ChevronRight, ExternalLink, TrendingUp, TrendingDown, RefreshCw, Layers, ArrowUp, ArrowDown } from 'lucide-react';

// Types for outcome aggregation
interface OutcomePosition {
	outcome: string;
	netShares: number;
	buyValue: number;
	sellValue: number;
	buyCount: number;
	sellCount: number;
}

interface EventSummary {
	conditionId: string;
	title: string | null;
	category: string | null;
	positions: OutcomePosition[];
}

// Aggregate trades by event and outcome
function aggregateByEventAndOutcome(group: TradeGroup): EventSummary[] {
	const eventMap = new Map<string, Map<string, OutcomePosition>>();
	const eventMeta = new Map<string, { title: string | null; category: string | null }>();

	// Get event metadata from the events array
	for (const event of group.events) {
		eventMeta.set(event.conditionId, { title: event.title, category: event.category });
	}

	// Aggregate trades
	for (const trade of group.trades) {
		const outcome = trade.outcome || 'Unknown';

		if (!eventMap.has(trade.conditionId)) {
			eventMap.set(trade.conditionId, new Map());
		}

		const outcomeMap = eventMap.get(trade.conditionId)!;
		if (!outcomeMap.has(outcome)) {
			outcomeMap.set(outcome, {
				outcome,
				netShares: 0,
				buyValue: 0,
				sellValue: 0,
				buyCount: 0,
				sellCount: 0,
			});
		}

		const pos = outcomeMap.get(outcome)!;
		if (trade.side === 'BUY') {
			pos.netShares += trade.size;
			pos.buyValue += trade.usdcValue;
			pos.buyCount++;
		} else {
			pos.netShares -= trade.size;
			pos.sellValue += trade.usdcValue;
			pos.sellCount++;
		}
	}

	// Convert to array format
	const result: EventSummary[] = [];
	for (const [conditionId, outcomeMap] of eventMap) {
		const meta = eventMeta.get(conditionId) || { title: null, category: null };
		const positions = Array.from(outcomeMap.values())
			// Sort by absolute value of position (largest first)
			.sort((a, b) => Math.abs(b.netShares) - Math.abs(a.netShares));

		result.push({
			conditionId,
			title: meta.title,
			category: meta.category,
			positions,
		});
	}

	return result;
}

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
		maximumFractionDigits: 4,
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

function formatTimestampShort(timestamp: string): string {
	const date = new Date(timestamp);
	return (
		date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
		' ' +
		date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
	);
}

function getGroupTypeConfig(groupType: TradeGroupType): {
	label: string;
	variant: 'default' | 'secondary' | 'destructive' | 'outline';
	icon: React.ReactNode;
} {
	switch (groupType) {
		case 'position_building':
			return {
				label: 'Building Position',
				variant: 'default',
				icon: <TrendingUp className="h-3 w-3" />,
			};
		case 'position_closing':
			return {
				label: 'Closing Position',
				variant: 'destructive',
				icon: <TrendingDown className="h-3 w-3" />,
			};
		case 'position_adjustment':
			return {
				label: 'Adjusting',
				variant: 'secondary',
				icon: <RefreshCw className="h-3 w-3" />,
			};
		case 'multi_event':
			return {
				label: 'Multi-Event',
				variant: 'outline',
				icon: <Layers className="h-3 w-3" />,
			};
	}
}

// Compact position display for each outcome
function PositionBadge({ position }: { position: OutcomePosition }) {
	const isLong = position.netShares > 0;
	const netValue = position.buyValue - position.sellValue;

	return (
		<div className="flex items-center gap-1.5 bg-muted/60 rounded px-2 py-1">
			<span className={`font-medium text-sm ${isLong ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
				{position.outcome}
			</span>
			<span className="text-xs text-muted-foreground">·</span>
			<span className={`flex items-center gap-0.5 text-xs font-mono ${isLong ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
				{isLong ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
				{formatUsd(Math.abs(netValue))}
			</span>
		</div>
	);
}

function TradeGroupCard({ group, isMobile }: { group: TradeGroup; isMobile: boolean }) {
	const [expanded, setExpanded] = useState(false);
	const groupConfig = getGroupTypeConfig(group.groupType);
	const eventSummaries = aggregateByEventAndOutcome(group);

	return (
		<Card className="mb-3">
			<CardContent className="pt-4 pb-3 px-4">
				{/* Header: Wallet + Group Type + Toggle */}
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-2">
						<span className="font-mono text-sm">{formatWallet(group.wallet)}</span>
						<Badge variant={groupConfig.variant} className="flex items-center gap-1">
							{groupConfig.icon}
							{groupConfig.label}
						</Badge>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setExpanded(!expanded)}
						className="h-8 w-8 p-0"
					>
						{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
					</Button>
				</div>

				{/* Summary Stats - simplified */}
				<div className="grid grid-cols-3 gap-3 mb-3">
					<div>
						<p className="text-xs text-muted-foreground">Total Value</p>
						<p className="font-mono font-semibold text-sm">{formatUsd(group.summary.totalValue)}</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Trades</p>
						<p className="font-medium text-sm">
							{group.summary.tradeCount} ({group.summary.buyCount} buy, {group.summary.sellCount} sell)
						</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Avg Price</p>
						<p className="font-mono text-sm">{formatPrice(group.summary.avgPrice)}</p>
					</div>
				</div>

				{/* Events with Positions */}
				<div className="mb-3">
					<p className="text-xs text-muted-foreground mb-2">Positions</p>
					<div className="space-y-2">
						{eventSummaries.slice(0, expanded ? undefined : 2).map((event) => (
							<div key={event.conditionId} className="bg-muted/30 rounded-md p-2">
								<div className="flex items-start gap-2 mb-1.5">
									{event.category && (
										<Badge variant="outline" className="text-xs shrink-0">
											{event.category}
										</Badge>
									)}
									<span className="text-sm leading-tight" title={event.title || event.conditionId}>
										{event.title || (
											<span className="text-muted-foreground italic">{event.conditionId.slice(0, 16)}...</span>
										)}
									</span>
								</div>
								<div className="flex flex-wrap gap-1.5">
									{event.positions.map((pos) => (
										<PositionBadge key={pos.outcome} position={pos} />
									))}
								</div>
							</div>
						))}
						{!expanded && eventSummaries.length > 2 && (
							<p className="text-xs text-muted-foreground">+{eventSummaries.length - 2} more events</p>
						)}
					</div>
				</div>

				{/* Time Range */}
				<div className="text-xs text-muted-foreground mb-2">
					{formatTimestampShort(group.summary.firstTradeTime)}
					{group.summary.firstTradeTime !== group.summary.lastTradeTime && (
						<> - {formatTimestampShort(group.summary.lastTradeTime)}</>
					)}
				</div>

				{/* Expanded: Individual Trades */}
				{expanded && (
					<div className="mt-4 pt-4 border-t">
						<p className="text-xs text-muted-foreground mb-2">Individual Trades</p>
						{isMobile ? (
							<div className="space-y-2">
								{group.trades.map((trade) => (
									<div key={trade.id} className="bg-muted/50 rounded p-2 text-sm">
										<div className="flex justify-between items-start mb-1">
											<span className="truncate flex-1 mr-2" title={trade.title || undefined}>
												{trade.title || trade.conditionId.slice(0, 16) + '...'}
											</span>
											<div className="flex items-center gap-1 shrink-0">
												<Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'} className="text-xs">
													{trade.side}
												</Badge>
												{trade.outcome && (
													<Badge variant="outline" className="text-xs">
														{trade.outcome}
													</Badge>
												)}
											</div>
										</div>
										<div className="flex justify-between text-xs">
											<span className="text-muted-foreground">{formatTimestampShort(trade.tradeTimestamp)}</span>
											<span className="font-mono">{formatUsd(trade.usdcValue)}</span>
										</div>
									</div>
								))}
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="text-xs">Time</TableHead>
										<TableHead className="text-xs">Event</TableHead>
										<TableHead className="text-xs">Side</TableHead>
										<TableHead className="text-xs">Outcome</TableHead>
										<TableHead className="text-xs text-right">Size</TableHead>
										<TableHead className="text-xs text-right">Price</TableHead>
										<TableHead className="text-xs text-right">Amount</TableHead>
										<TableHead className="text-xs">Tx</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{group.trades.map((trade) => (
										<TableRow key={trade.id}>
											<TableCell className="text-xs text-muted-foreground whitespace-nowrap">
												{formatTimestampShort(trade.tradeTimestamp)}
											</TableCell>
											<TableCell className="text-xs max-w-[200px] truncate" title={trade.title || undefined}>
												{trade.title || trade.conditionId.slice(0, 16) + '...'}
											</TableCell>
											<TableCell>
												<Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'} className="text-xs">
													{trade.side}
												</Badge>
											</TableCell>
											<TableCell className="text-xs">
												{trade.outcome || '-'}
											</TableCell>
											<TableCell className="text-xs text-right font-mono">{formatNumber(trade.size)}</TableCell>
											<TableCell className="text-xs text-right font-mono">{formatPrice(trade.price)}</TableCell>
											<TableCell className="text-xs text-right font-mono font-medium">
												{formatUsd(trade.usdcValue)}
											</TableCell>
											<TableCell>
												<a
													href={`https://polygonscan.com/tx/${trade.transactionHash}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary hover:underline text-xs flex items-center gap-1"
												>
													<ExternalLink className="h-3 w-3" />
												</a>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface GroupedTradesViewProps {
	groups: TradeGroup[];
	isMobile: boolean;
	timeWindowHours: number;
	totalTrades: number;
}

export function GroupedTradesView({ groups, isMobile, timeWindowHours, totalTrades }: GroupedTradesViewProps) {
	if (groups.length === 0) {
		return (
			<div className="text-muted-foreground py-8 text-center text-sm">
				No grouped whale activity found in the last {timeWindowHours} hours.
			</div>
		);
	}

	return (
		<div>
			<div className="mb-4 text-sm text-muted-foreground">
				{groups.length} wallet groups, {totalTrades} total trades in last {timeWindowHours}h
			</div>
			{groups.map((group) => (
				<TradeGroupCard key={group.id} group={group} isMobile={isMobile} />
			))}
		</div>
	);
}
