import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { z } from 'zod';
import { updateWalletLabelSchema } from '@/schemas/api';

// Ethereum address regex (0x followed by 40 hex characters)
const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

const walletParamSchema = z.string().regex(ethereumAddressRegex, 'Invalid wallet address format');

// DELETE /api/wallets/followed/[wallet] - Unfollow a wallet
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { wallet } = await params;
		const parseResult = walletParamSchema.safeParse(wallet);

		if (!parseResult.success) {
			return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
		}

		const walletAddress = parseResult.data.toLowerCase();

		const result = await sql`
			DELETE FROM followed_wallets
			WHERE clerk_id = ${userId} AND wallet_address = ${walletAddress}
			RETURNING id
		`;

		if (result.length === 0) {
			return NextResponse.json({ error: 'Wallet not found in followed list' }, { status: 404 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Failed to unfollow wallet:', error);
		return NextResponse.json({ error: 'Failed to unfollow wallet' }, { status: 500 });
	}
}

// PATCH /api/wallets/followed/[wallet] - Update wallet label
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { wallet } = await params;
		const walletParseResult = walletParamSchema.safeParse(wallet);

		if (!walletParseResult.success) {
			return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
		}

		const walletAddress = walletParseResult.data.toLowerCase();

		const body = await request.json();
		const bodyParseResult = updateWalletLabelSchema.safeParse(body);

		if (!bodyParseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid request body', details: bodyParseResult.error.flatten() },
				{ status: 400 },
			);
		}

		const { label } = bodyParseResult.data;

		const result = await sql`
			UPDATE followed_wallets
			SET label = ${label || null}
			WHERE clerk_id = ${userId} AND wallet_address = ${walletAddress}
			RETURNING id, wallet_address, label, created_at
		`;

		if (result.length === 0) {
			return NextResponse.json({ error: 'Wallet not found in followed list' }, { status: 404 });
		}

		const updatedWallet = result[0];
		return NextResponse.json({
			wallet: {
				id: updatedWallet.id,
				walletAddress: updatedWallet.wallet_address,
				label: updatedWallet.label,
				createdAt: updatedWallet.created_at,
			},
		});
	} catch (error) {
		console.error('Failed to update wallet label:', error);
		return NextResponse.json({ error: 'Failed to update wallet label' }, { status: 500 });
	}
}
