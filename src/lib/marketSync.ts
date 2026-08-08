import { sql } from '@/lib/db';
import { fetchMarketByConditionId } from '@/lib/polymarket';

interface MarketRow {
	id: string;
	condition_id: string;
}

// Missing markets are fetched a chunk at a time rather than strictly
// sequentially: 50 sequential CLOB round-trips do not fit in maxDuration, and
// unbounded Promise.all on the whole list would hammer Polymarket's rate limit.
const SYNC_CHUNK_SIZE = 5;

async function syncOneMarket(conditionId: string): Promise<{ conditionId: string; marketId: string } | null> {
	try {
		const marketData = await fetchMarketByConditionId(conditionId);
		if (!marketData) return null;

		const insertResult = (await sql`
			INSERT INTO markets (condition_id, slug, question, description, image_url, tags, is_active, is_closed, end_date, last_synced_at)
			VALUES (
				${conditionId},
				${marketData.market_slug || null},
				${marketData.question || 'Unknown Market'},
				${marketData.description || null},
				${marketData.icon || null},
				${JSON.stringify(marketData.tags)}::jsonb,
				${marketData.active ?? true},
				${marketData.closed ?? false},
				${marketData.end_date_iso ? new Date(marketData.end_date_iso) : null},
				${new Date()}
			)
			ON CONFLICT (condition_id) DO UPDATE SET
				slug = COALESCE(EXCLUDED.slug, markets.slug),
				question = COALESCE(EXCLUDED.question, markets.question),
				description = COALESCE(EXCLUDED.description, markets.description),
				tags = EXCLUDED.tags,
				is_active = EXCLUDED.is_active,
				is_closed = EXCLUDED.is_closed,
				end_date = COALESCE(EXCLUDED.end_date, markets.end_date),
				last_synced_at = EXCLUDED.last_synced_at
			RETURNING id
		`) as { id: string }[];

		const inserted = insertResult[0];
		if (!inserted) return null;

		return { conditionId, marketId: inserted.id };
	} catch (error) {
		console.error(`Failed to sync market for condition ${conditionId}:`, error);
		return null;
	}
}

// Resolves condition IDs to market row IDs, fetching and upserting any market
// we don't have yet. Markets that can't be fetched are simply absent from the
// returned map — callers treat that as "no market_id yet", not as an error.
export async function syncMarketsForConditionIds(conditionIds: string[]): Promise<Map<string, string>> {
	const conditionToMarketId = new Map<string, string>();

	if (conditionIds.length === 0) return conditionToMarketId;

	const existingMarkets = (await sql`
		SELECT id, condition_id FROM markets
		WHERE condition_id = ANY(${conditionIds})
	`) as MarketRow[];

	for (const market of existingMarkets) {
		conditionToMarketId.set(market.condition_id, market.id);
	}

	const missingConditionIds = conditionIds.filter((id) => !conditionToMarketId.has(id));

	for (let i = 0; i < missingConditionIds.length; i += SYNC_CHUNK_SIZE) {
		const chunk = missingConditionIds.slice(i, i + SYNC_CHUNK_SIZE);
		const results = await Promise.all(chunk.map(syncOneMarket));

		for (const result of results) {
			if (result) conditionToMarketId.set(result.conditionId, result.marketId);
		}
	}

	return conditionToMarketId;
}
