import { Pool } from "pg";

const isProduction = process.env.NODE_ENV === 'production';
export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,  // ← AJOUTÉ
    idleTimeoutMillis: 0,  // ← AJOUTÉ
    connectionTimeoutMillis: 10000,  // ← AJOUTÉ
});

export async function query(text: string, params?: any[]) {
    const res = await db.query(text, params);
    return res;
}

