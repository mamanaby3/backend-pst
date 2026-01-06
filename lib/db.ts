import { Pool } from "pg";
export const db = new Pool({ connectionString: process.env.DATABASE_URL,ssl: { rejectUnauthorized: false }  });

export async function query(text: string, params?: any[]) {
    const res = await db.query(text, params);
    return res;
}

