import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchWhaleTrades, calculateUsdValue, fetchMarketByConditionId, fetchEventTagsForConditionIds } from '@/lib/polymarket';
import { WHALE_THRESHOLD_DEFAULT } from '@/lib/constants';

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

			const insertResult = (await sql`
				INSERT INTO markets (condition_id, slug, question, description, image_url, tags, is_active, is_closed, end_date, last_synced_at)
				VALUES (
					${conditionId},
					${marketData.slug || null},
					${marketData.question || 'Unknown Market'},
					${marketData.description || null},
					${marketData.image || null},
					'[]'::jsonb,
					${marketData.active ?? true},
					${marketData.closed ?? false},
					${marketData.endDate ? new Date(marketData.endDate) : null},
					${new Date()}
				)
				ON CONFLICT (condition_id) DO UPDATE SET
					slug = COALESCE(EXCLUDED.slug, markets.slug),
					question = COALESCE(EXCLUDED.question, markets.question),
					description = COALESCE(EXCLUDED.description, markets.description),
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

/**
 * Fetches tags from parent events and updates markets that have empty tags.
 * Tags in Polymarket live on events, not on individual markets.
 */
async function syncTagsFromEvents(conditionIds: string[]): Promise<number> {
	if (conditionIds.length === 0) return 0;

	console.log(`[ingest] syncTagsFromEvents called with ${conditionIds.length} condition IDs`);

	// Fetch event tags for all condition IDs
	const conditionToTags = await fetchEventTagsForConditionIds(conditionIds);
	console.log(`[ingest] fetchEventTagsForConditionIds returned ${conditionToTags.size} matches`);

	if (conditionToTags.size === 0) return 0;

	let updated = 0;
	for (const [conditionId, tagLabels] of conditionToTags) {
		try {
			console.log(`[ingest] Updating tags for ${conditionId}: ${JSON.stringify(tagLabels)}`);
			await sql`
				UPDATE markets
				SET tags = ${JSON.stringify(tagLabels)}::jsonb, last_synced_at = ${new Date()}
				WHERE condition_id = ${conditionId}
					AND (tags IS NULL OR jsonb_array_length(tags) = 0)
			`;
			updated++;
		} catch (error) {
			console.error(`Failed to update tags for condition ${conditionId}:`, error);
		}
	}

	console.log(`[ingest] syncTagsFromEvents updated ${updated} markets`);
	return updated;
}

export async function POST() {
	try {
		const trades = await fetchWhaleTrades({ minAmount: WHALE_THRESHOLD_DEFAULT });

		if (trades.length === 0) {
			return NextResponse.json({ fetched: 0, new: 0 });
		}

		const hashes = trades.map((t) => t.transactionHash);
		const existing = await sql`
			SELECT transaction_hash FROM trades
			WHERE transaction_hash = ANY(${hashes})
		`;
		const existingHashes = new Set(existing.map((r) => r.transaction_hash));

		const newTrades = trades.filter((t) => !existingHashes.has(t.transactionHash));

		if (newTrades.length === 0) {
			return NextResponse.json({ fetched: trades.length, new: 0 });
		}

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

		// Sync tags from parent events for newly synced markets
		const tagsBackfilled = await syncTagsFromEvents(uniqueConditionIds);

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

			// Also sync tags for backfilled markets
			await syncTagsFromEvents(backfillConditionIds);
		}

		// Backfill tags for existing markets that still have empty tags
		const marketsWithEmptyTags = (await sql`
			SELECT condition_id FROM markets
			WHERE tags IS NULL OR jsonb_array_length(tags) = 0
			LIMIT 50
		`) as { condition_id: string }[];

		if (marketsWithEmptyTags.length > 0) {
			const emptyTagConditionIds = marketsWithEmptyTags.map((m) => m.condition_id);
			await syncTagsFromEvents(emptyTagConditionIds);
		}

		return NextResponse.json({
			fetched: trades.length,
			new: newTrades.length,
			backfilled: tradesWithoutMarket.length,
			tagsBackfilled,
		});
	} catch (error) {
		console.error('Ingestion error:', error);
		return NextResponse.json({ error: 'Failed to ingest trades' }, { status: 500 });
	}
}
