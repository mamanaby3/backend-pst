// test.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres.ollyuxnzcngflnpjgspq:Passer%400301aby@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    ssl: { rejectUnauthorized: false },
    max: 1,
});

async function test() {
    try {
        const client = await pool.connect();
        console.log('✅ Connexion réussie!');

        const res = await client.query('SELECT NOW() as time, current_user as user, current_database() as db');
        console.log('Résultat:', res.rows[0]);

        client.release();
        await pool.end();
    } catch (err) {
        console.error('❌ Erreur:', err.message);
        console.error('Code:', err.code);
    }
}

test();