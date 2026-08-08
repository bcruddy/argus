import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// A static {status:'ok'} is what let ingestion stay down for 103 days unnoticed, so
// the body still reports pipeline freshness — but only "cannot reach the database"
// is a 503. $250k+ whale trades are legitimately sparse and ingest polls every 15
// minutes via GH Actions (vercel.json is a daily backstop that GitHub can also
// disable after 60 idle days), so an empty table or a quiet 24h stretch is a
// serving app, not an outage; 503ing it paged uptime monitors falsely and made
// "no whales lately" indistinguishable from "DB unreachable" for anything
// scripting on status codes. Monitors that want dryness alerts read the body.
const STALE_AFTER_HOURS = 24;

export async function GET() {
	try {
		const rows = (await sql`SELECT max(trade_timestamp) AS newest FROM trades`) as {
			newest: string | Date | null;
		}[];

		const newest = rows[0]?.newest ? new Date(rows[0].newest) : null;

		if (!newest) {
			return NextResponse.json({ status: 'empty', newestTrade: null, staleHours: null });
		}

		const staleHours = Math.round(((Date.now() - newest.getTime()) / 3_600_000) * 10) / 10;

		return NextResponse.json({
			status: staleHours > STALE_AFTER_HOURS ? 'stale' : 'ok',
			newestTrade: newest.toISOString(),
			staleHours,
		});
	} catch (error) {
		// Readiness probe stays unauthenticated, so it must not leak error detail.
		console.error('[health] database check failed:', error);
		return NextResponse.json({ status: 'error' }, { status: 503 });
	}
}
