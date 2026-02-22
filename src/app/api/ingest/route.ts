import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchWhaleTrades, calculateUsdValue, fetchMarketByConditionId } from '@/lib/polymarket';
import {
	WHALE_THRESHOLD_DEFAULT,
	INGEST_MAX_DAYS_BACK,
	INGEST_MIN_WHALE_TRADES,
	INGEST_PAGE_SIZE,
} from '@/lib/constants';

interface MarketRow {
	id: string;
	condition_id: string;
}

async function syncMarketsForConditionIds(conditionIds: string[]): Promise<Map<string, string>> {
	const conditionToMarketId = new Map<string, string>();

	if (conditionIds.length === 0) return conditionToMarketId;

	// Check which markets already exist
	const existingMarkets = (await sql`
		SELECT id, condition_id FROM markets
		WHERE condition_id = ANY(${conditionIds})
	`) as MarketRow[];

	for (const market of existingMarkets) {
		conditionToMarketId.set(market.condition_id, market.id);
	}

	// Find condition IDs that don't have markets yet
	const missingConditionIds = conditionIds.filter((id) => !conditionToMarketId.has(id));

	// Fetch and insert missing markets from Polymarket Gamma API
	for (const conditionId of missingConditionIds) {
		try {
			const marketData = await fetchMarketByConditionId(conditionId);
			if (!marketData) continue;

			// Convert tags to JSONB array of labels for simpler filtering
			const tagLabels = marketData.tags?.map((t) => t.label).filter(Boolean) || [];

			const insertResult = (await sql`
				INSERT INTO markets (condition_id, slug, question, description, image_url, tags, is_active, is_closed, end_date, last_synced_at)
				VALUES (
					${conditionId},
					${marketData.slug || null},
					${marketData.question || 'Unknown Market'},
					${marketData.description || null},
					${marketData.image || null},
					${JSON.stringify(tagLabels)},
					${marketData.active ?? true},
					${marketData.closed ?? false},
					${marketData.endDate ? new Date(marketData.endDate) : null},
					${new Date()}
				)
				ON CONFLICT (condition_id) DO UPDATE SET
					slug = COALESCE(EXCLUDED.slug, markets.slug),
					question = COALESCE(EXCLUDED.question, markets.question),
					description = COALESCE(EXCLUDED.description, markets.description),
					image_url = COALESCE(EXCLUDED.image_url, markets.image_url),
					tags = EXCLUDED.tags,
					is_active = EXCLUDED.is_active,
					is_closed = EXCLUDED.is_closed,
					end_date = COALESCE(EXCLUDED.end_date, markets.end_date),
					last_synced_at = EXCLUDED.last_synced_at
				RETURNING id
			`) as { id: string }[];

			if (insertResult.length > 0) {
				conditionToMarketId.set(conditionId, insertResult[0].id);
			}
		} catch (error) {
			console.error(`Failed to sync market for condition ${conditionId}:`, error);
		}
	}

	return conditionToMarketId;
}

export async function POST() {
	try {
		const cutoffMs = Date.now() - INGEST_MAX_DAYS_BACK * 24 * 60 * 60 * 1000;
		const maxPages = 100; // Safety limit to prevent runaway fetching
		let totalFetched = 0;
		let totalNew = 0;
		let offset = 0;
		let reachedExistingData = false;

		for (let page = 0; page < maxPages; page++) {
			const trades = await fetchWhaleTrades({
				minAmount: WHALE_THRESHOLD_DEFAULT,
				limit: INGEST_PAGE_SIZE,
				offset,
			});

			if (trades.length === 0) break;
			totalFetched += trades.length;

			// Check if oldest trade on this page is beyond our cutoff
			const oldestTrade = trades[trades.length - 1];
			const oldestTimestampMs = oldestTrade.timestamp * 1000;
			const pastCutoff = oldestTimestampMs < cutoffMs;

			// Filter to trades within our time window
			const tradesInWindow = pastCutoff
				? trades.filter((t) => t.timestamp * 1000 >= cutoffMs)
				: trades;

			if (tradesInWindow.length > 0) {
				// Check for duplicates
				const hashes = tradesInWindow.map((t) => t.transactionHash);
				const existing = await sql`
					SELECT transaction_hash FROM trades
					WHERE transaction_hash = ANY(${hashes})
				`;
				const existingHashes = new Set(existing.map((r) => r.transaction_hash));
				const newTrades = tradesInWindow.filter((t) => !existingHashes.has(t.transactionHash));

				// If every trade on this page is already in the DB, we've caught up
				if (newTrades.length === 0) {
					reachedExistingData = true;
				}

				if (newTrades.length > 0) {
					// Sync markets for all unique condition IDs in new trades
					const uniqueConditionIds = [...new Set(newTrades.map((t) => t.conditionId))];
					const conditionToMarketId = await syncMarketsForConditionIds(uniqueConditionIds);

					for (const trade of newTrades) {
						const usdcValue = calculateUsdValue(trade.size, trade.price);
						const tradeTimestamp = new Date(trade.timestamp * 1000);
						const marketId = conditionToMarketId.get(trade.conditionId) || null;

						await sql`
							INSERT INTO trades (
								transaction_hash,
								market_id,
								condition_id,
								asset_id,
								outcome,
								proxy_wallet,
								side,
								size,
								price,
								usdc_value,
								trade_timestamp,
								is_whale,
								detection_rule,
								title
							) VALUES (
								${trade.transactionHash},
								${marketId},
								${trade.conditionId},
								${trade.asset},
								${trade.outcome || null},
								${trade.proxyWallet},
								${trade.side},
								${trade.size},
								${trade.price},
								${usdcValue},
								${tradeTimestamp},
								true,
								'threshold_250k',
								${trade.title || null}
							)
						`;
					}

					totalNew += newTrades.length;
				}
			}

			// Stop conditions:
			// 1. Reached our time cutoff (364 days back)
			if (pastCutoff) break;
			// 2. Found enough new whale trades
			if (totalNew >= INGEST_MIN_WHALE_TRADES) break;
			// 3. Reached data we already have (all duplicates)
			if (reachedExistingData) break;
			// 4. API returned fewer results than requested (no more data)
			if (trades.length < INGEST_PAGE_SIZE) break;

			offset += INGEST_PAGE_SIZE;
		}

		// Backfill existing trades that don't have market_id (limit to 50 per request)
		const tradesWithoutMarket = (await sql`
			SELECT DISTINCT condition_id FROM trades
			WHERE market_id IS NULL
			LIMIT 50
		`) as { condition_id: string }[];

		if (tradesWithoutMarket.length > 0) {
			const backfillConditionIds = tradesWithoutMarket.map((t) => t.condition_id);
			const backfillMarketIds = await syncMarketsForConditionIds(backfillConditionIds);

			// Update trades with the newly synced market IDs
			for (const [conditionId, marketId] of backfillMarketIds) {
				await sql`
					UPDATE trades
					SET market_id = ${marketId}
					WHERE condition_id = ${conditionId} AND market_id IS NULL
				`;
			}
		}

		return NextResponse.json({
			fetched: totalFetched,
			new: totalNew,
			backfilled: tradesWithoutMarket.length,
		});
	} catch (error) {
		console.error('Ingestion error:', error);
		return NextResponse.json({ error: 'Failed to ingest trades' }, { status: 500 });
	}
}
