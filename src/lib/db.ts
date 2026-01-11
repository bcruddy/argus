import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL environment variable is required');
}

// Use sql as a tagged template literal:
// const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
export const sql = neon(process.env.DATABASE_URL);
