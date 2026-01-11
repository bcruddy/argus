import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const limit = Math.min(Number(searchParams.get('limit') || 50), 100);

		const trades = await sql`
			SELECT
				id,
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
				created_at
			FROM trades
			WHERE is_whale = true
			ORDER BY trade_timestamp DESC
			LIMIT ${limit}
		`;

		return NextResponse.json({ trades });
	} catch (error) {
		console.error('Failed to fetch trades:', error);
		return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
	}
}
