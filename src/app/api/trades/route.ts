import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
		const sort = searchParams.get('sort') || 'time';
		const order = searchParams.get('order') || 'desc';

		let trades;

		if (sort === 'amount') {
			trades =
				order === 'asc'
					? await sql`
					SELECT id, transaction_hash, condition_id, asset_id, outcome,
						proxy_wallet, side, size, price, usdc_value,
						trade_timestamp, is_whale, detection_rule, title, created_at
					FROM trades
					WHERE is_whale = true
					ORDER BY usdc_value ASC
					LIMIT ${limit}
				`
					: await sql`
					SELECT id, transaction_hash, condition_id, asset_id, outcome,
						proxy_wallet, side, size, price, usdc_value,
						trade_timestamp, is_whale, detection_rule, title, created_at
					FROM trades
					WHERE is_whale = true
					ORDER BY usdc_value DESC
					LIMIT ${limit}
				`;
		} else {
			trades =
				order === 'asc'
					? await sql`
					SELECT id, transaction_hash, condition_id, asset_id, outcome,
						proxy_wallet, side, size, price, usdc_value,
						trade_timestamp, is_whale, detection_rule, title, created_at
					FROM trades
					WHERE is_whale = true
					ORDER BY trade_timestamp ASC
					LIMIT ${limit}
				`
					: await sql`
					SELECT id, transaction_hash, condition_id, asset_id, outcome,
						proxy_wallet, side, size, price, usdc_value,
						trade_timestamp, is_whale, detection_rule, title, created_at
					FROM trades
					WHERE is_whale = true
					ORDER BY trade_timestamp DESC
					LIMIT ${limit}
				`;
		}

		return NextResponse.json({ trades });
	} catch (error) {
		console.error('Failed to fetch trades:', error);
		return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
	}
}
