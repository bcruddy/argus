import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { fetchWhaleTrades, calculateUsdValue } from '@/lib/polymarket';
import { WHALE_THRESHOLD_DEFAULT } from '@/lib/constants';

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

		for (const trade of newTrades) {
			const usdcValue = calculateUsdValue(trade.size, trade.price);
			const tradeTimestamp = new Date(trade.timestamp * 1000);

			await sql`
				INSERT INTO trades (
					transaction_hash,
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

		return NextResponse.json({
			fetched: trades.length,
			new: newTrades.length,
		});
	} catch (error) {
		console.error('Ingestion error:', error);
		return NextResponse.json({ error: 'Failed to ingest trades' }, { status: 500 });
	}
}
