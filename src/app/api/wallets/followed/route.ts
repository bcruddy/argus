import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { toFollowedWallet, type FollowedWalletRow } from '@/lib/queries/wallets';
import { followWalletSchema } from '@/schemas/api';

// GET /api/wallets/followed - List all followed wallets for the current user
export async function GET() {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const wallets = (await sql`
			SELECT id, wallet_address, label, created_at
			FROM followed_wallets
			WHERE clerk_id = ${userId}
			ORDER BY created_at DESC
		`) as FollowedWalletRow[];

		return NextResponse.json({ wallets: wallets.map(toFollowedWallet) });
	} catch (error) {
		console.error('Failed to fetch followed wallets:', error);
		return NextResponse.json({ error: 'Failed to fetch followed wallets' }, { status: 500 });
	}
}

// POST /api/wallets/followed - Follow a new wallet
export async function POST(request: NextRequest) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body: unknown = await request.json();
		const parseResult = followWalletSchema.safeParse(body);

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid request body', details: parseResult.error.flatten() },
				{ status: 400 },
			);
		}

		const { walletAddress, label } = parseResult.data;

		// Insert with ON CONFLICT to handle duplicate follows gracefully
		const result = (await sql`
			INSERT INTO followed_wallets (clerk_id, wallet_address, label)
			VALUES (${userId}, ${walletAddress}, ${label || null})
			ON CONFLICT (clerk_id, wallet_address) DO UPDATE
			SET label = COALESCE(EXCLUDED.label, followed_wallets.label)
			RETURNING id, wallet_address, label, created_at
		`) as FollowedWalletRow[];

		const wallet = result[0];
		if (!wallet) {
			return NextResponse.json({ error: 'Failed to follow wallet' }, { status: 500 });
		}

		return NextResponse.json({ wallet: toFollowedWallet(wallet) });
	} catch (error) {
		console.error('Failed to follow wallet:', error);
		return NextResponse.json({ error: 'Failed to follow wallet' }, { status: 500 });
	}
}
