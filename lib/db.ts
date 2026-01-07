import { Pool } from "pg";

// const isProduction = process.env.NODE_ENV === 'production';
// export const db = new Pool({
//     connectionString: process.env.DATABASE_URL,
//    // pour vercelje commente pour que l'api passe au niveau du web
//     // ssl: { rejectUnauthorized: false },
//     // max: 1,  // ← AJOUTÉ
//     // idleTimeoutMillis: 0,  // ← AJOUTÉ
//     // connectionTimeoutMillis: 10000,  // ← AJOUTÉ
// });

export const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text: string, params?: any[]) {
    const res = await db.query(text, params);
    return res;
}

