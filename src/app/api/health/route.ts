import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Ingest runs every 5 minutes and $250k+ trades are sparse, so a quiet hour is
// normal — a full day without one means the pipeline is dead. A static
// {status:'ok'} is what let ingestion stay down for 103 days unnoticed.
const STALE_AFTER_HOURS = 24;

export async function GET() {
	try {
		const rows = (await sql`SELECT max(trade_timestamp) AS newest FROM trades`) as {
			newest: string | Date | null;
		}[];

		const newest = rows[0]?.newest ? new Date(rows[0].newest) : null;

		if (!newest) {
			return NextResponse.json({ status: 'stale', newestTrade: null, staleHours: null }, { status: 503 });
		}

		const staleHours = Math.round(((Date.now() - newest.getTime()) / 3_600_000) * 10) / 10;
		const body = {
			status: staleHours > STALE_AFTER_HOURS ? 'stale' : 'ok',
			newestTrade: newest.toISOString(),
			staleHours,
		};

		return NextResponse.json(body, { status: body.status === 'stale' ? 503 : 200 });
	} catch (error) {
		// Readiness probe stays unauthenticated, so it must not leak error detail.
		console.error('[health] database check failed:', error);
		return NextResponse.json({ status: 'error' }, { status: 503 });
	}
}
