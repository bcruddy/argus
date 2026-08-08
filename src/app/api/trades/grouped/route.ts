import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { groupedTradesQuerySchema } from '@/schemas/api';
import { buildGroupedTradesResponse } from '@/lib/grouping';
import { queryTradesForGrouping } from '@/lib/queries/trades';

export async function GET(request: NextRequest) {
	try {
		// Defense in depth: the proxy middleware is the primary gate, but a
		// middleware bypass must not expose this route (audit 2026-08-07).
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);

		// Validate and parse query parameters with Zod
		const parseResult = groupedTradesQuerySchema.safeParse({
			category: searchParams.get('category'),
			event: searchParams.get('event'),
			minAmount: searchParams.get('minAmount'),
			wallet: searchParams.get('wallet'),
			timeWindowHours: searchParams.get('timeWindowHours'),
			limit: searchParams.get('limit'),
		});

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid query parameters', details: parseResult.error.flatten() },
				{ status: 400 },
			);
		}

		const { timeWindowHours, limit } = parseResult.data;
		const trades = await queryTradesForGrouping(parseResult.data, { kind: 'all' });

		return NextResponse.json(buildGroupedTradesResponse(trades, timeWindowHours, limit));
	} catch (error) {
		console.error('Failed to fetch grouped trades:', error);
		return NextResponse.json({ error: 'Failed to fetch grouped trades' }, { status: 500 });
	}
}
