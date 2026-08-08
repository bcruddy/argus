import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
	const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

	if (!WEBHOOK_SECRET) {
		throw new Error('CLERK_WEBHOOK_SECRET is not set');
	}

	const headerPayload = await headers();
	const svix_id = headerPayload.get('svix-id');
	const svix_timestamp = headerPayload.get('svix-timestamp');
	const svix_signature = headerPayload.get('svix-signature');

	if (!svix_id || !svix_timestamp || !svix_signature) {
		return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
	}

	const payload: unknown = await req.json();
	const body = JSON.stringify(payload);

	const wh = new Webhook(WEBHOOK_SECRET);
	let evt: WebhookEvent;

	try {
		evt = wh.verify(body, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		}) as WebhookEvent;
	} catch (err) {
		console.error('Error verifying webhook:', err);
		return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
	}

	const eventType = evt.type;

	switch (eventType) {
		case 'user.created':
			// TODO: Create user in database
			console.log('User created:', evt.data.id);
			break;
		case 'user.updated':
			// TODO: Update user in database
			console.log('User updated:', evt.data.id);
			break;
		case 'user.deleted':
			// TODO: Delete user from database
			console.log('User deleted:', evt.data.id);
			break;
		default:
			console.log('Unhandled webhook event:', eventType);
	}

	return NextResponse.json({ received: true });
}
