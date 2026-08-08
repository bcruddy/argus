import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { tradesQuerySchema } from '@/schemas/api';
import { queryTrades } from '@/lib/queries/trades';

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
		const parseResult = tradesQuerySchema.safeParse({
			limit: searchParams.get('limit'),
			offset: searchParams.get('offset'),
			sort: searchParams.get('sort'),
			order: searchParams.get('order'),
			category: searchParams.get('category'),
			event: searchParams.get('event'),
			minAmount: searchParams.get('minAmount'),
			wallet: searchParams.get('wallet'),
		});

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid query parameters', details: parseResult.error.flatten() },
				{ status: 400 },
			);
		}

		return NextResponse.json(await queryTrades(parseResult.data, { kind: 'all' }));
	} catch (error) {
		console.error('Failed to fetch trades:', error);
		return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
	}
}
