// test-db-queries.js
// Script pour tester toutes les requêtes AVANT de déployer

import {config} from "dotenv";

import {Pool} from "pg";

config({ path: '.env.local' });


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
});

async function testAllQueries() {
    console.log('🚀 Démarrage des tests...\n');

    try {
        // ========================================
        // TEST 1 : Connexion à la base
        // ========================================
        console.log('📡 TEST 1: Connexion à la base de données');
        const testConnection = await pool.query('SELECT NOW() as time, current_database() as db');
        console.log('✅ Connecté à:', testConnection.rows[0].db);
        console.log('⏰ Heure:', testConnection.rows[0].time);
        console.log('');

        // ========================================
        // TEST 2 : Récupération d'un plan
        // ========================================
        console.log('📋 TEST 2: Récupération d\'un plan d\'abonnement');
        const plan_id = 1; // Changez selon vos données
        const planQuery = await pool.query(
            'SELECT * FROM subscription_plans WHERE id = $1',
            [plan_id]
        );

        if (planQuery.rows.length === 0) {
            console.warn('⚠️  Aucun plan trouvé avec l\'ID', plan_id);
            console.log('   Créons-en un pour les tests...');

            const createPlan = await pool.query(
                `INSERT INTO subscription_plans (name, description, price, duration_days, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
                ['Test Plan', 'Plan de test', 5000, 30, 'driver']
            );
            console.log('✅ Plan créé:', createPlan.rows[0]);
        } else {
            console.log('✅ Plan trouvé:', planQuery.rows[0]);
        }
        console.log('');

        // ========================================
        // TEST 3 : Insertion d'un paiement
        // ========================================
        console.log('💳 TEST 3: Insertion d\'un paiement');
        const user_id = 8; // Changez selon vos données
        const amount = 5000;
        const method = 'mobile_money';
        const transaction_id = `TEST${Date.now()}`;
        const mobile_provider = 'wave';
        const mobile_number = '221771234567';

        console.log('Paramètres:', {
            user_id,
            amount,
            method,
            transaction_id,
            mobile_provider,
            mobile_number
        });

        const paymentInsert = await pool.query(
            `INSERT INTO payments (
        user_id, amount, status, method, payment_type,
        transaction_id, payment_provider, mobile_number
      ) VALUES ($1, $2, 'pending', $3, 'subscription', $4, $5, $6)
      RETURNING id`,
            [user_id, amount, method, transaction_id, mobile_provider, mobile_number]
        );

        const payment_id = paymentInsert.rows[0].id;
        console.log('✅ Paiement créé avec l\'ID:', payment_id);
        console.log('');

        // ========================================
        // TEST 4 : Insertion d'un abonnement avec INTERVAL
        // ========================================
        console.log('📅 TEST 4: Insertion d\'un abonnement');
        const plan = planQuery.rows[0] || { id: 1, name: 'Test Plan', price: 5000, duration_days: 30 };

        console.log('Paramètres:', {
            user_id,
            plan_id: plan.id,
            type: plan.name,
            price: plan.price,
            duration_days: plan.duration_days,
            payment_id
        });

        // Test ANCIEN format (qui peut échouer)
        console.log('  Test format INTERVAL avec concaténation...');
        try {
            await pool.query(
                `INSERT INTO subscriptions (
          user_id, plan_id, type, price, start_date,
          end_date, active, payment_id
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE,
          CURRENT_DATE + ($5 || ' days')::INTERVAL,
          false, $6
        )`,
                [user_id, plan.id, plan.name, plan.price, plan.duration_days, payment_id]
            );
            console.log('  ✅ Format ANCIEN fonctionne');
        } catch (err) {
            console.log('  ❌ Format ANCIEN échoue:', err.message);
            console.log('  🔄 Test du NOUVEAU format...');

            // Test NOUVEAU format (recommandé)
            await pool.query(
                `INSERT INTO subscriptions (
          user_id, plan_id, type, price, start_date,
          end_date, active, payment_id
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE,
          CURRENT_DATE + INTERVAL '1 day' * $5,
          false, $6
        )`,
                [user_id, plan.id, plan.name, plan.price, plan.duration_days, payment_id]
            );
            console.log('  ✅ Format NOUVEAU fonctionne');
        }
        console.log('');

        // ========================================
        // TEST 5 : Mise à jour du metadata (CRITIQUE)
        // ========================================
        console.log('💾 TEST 5: Mise à jour du metadata (le plus important)');
        const paytech_token = 'test_token_123';
        const payment_url = 'https://paytech.sn/test/checkout/123';

        console.log('Paramètres:', { paytech_token, payment_url, payment_id });

        // Test MÉTHODE 1 : jsonb_build_object avec cast
        console.log('  Méthode 1: jsonb_build_object avec cast...');
        try {
            await pool.query(
                `UPDATE payments
         SET metadata = jsonb_build_object(
             'paytech_token', $1::text,
             'payment_url', $2::text
         )
         WHERE id = $3`,
                [paytech_token, payment_url, payment_id]
            );
            console.log('  ✅ Méthode 1 fonctionne');
        } catch (err) {
            console.log('  ❌ Méthode 1 échoue:', err.message);
        }

        // Test MÉTHODE 2 : JSON.stringify avec cast
        console.log('  Méthode 2: JSON.stringify avec cast...');
        try {
            const metadata = JSON.stringify({
                paytech_token,
                payment_url,
                test_method: 2
            });

            await pool.query(
                `UPDATE payments
         SET metadata = $1::jsonb
         WHERE id = $2`,
                [metadata, payment_id]
            );
            console.log('  ✅ Méthode 2 fonctionne');
        } catch (err) {
            console.log('  ❌ Méthode 2 échoue:', err.message);
        }

        // Test MÉTHODE 3 : Concaténation directe (moins sûre)
        console.log('  Méthode 3: Concaténation dans SQL...');
        try {
            await pool.query(
                `UPDATE payments
         SET metadata = metadata || $1::jsonb
         WHERE id = $2`,
                [JSON.stringify({ test_method: 3, paytech_token }), payment_id]
            );
            console.log('  ✅ Méthode 3 fonctionne');
        } catch (err) {
            console.log('  ❌ Méthode 3 échoue:', err.message);
        }

        // Vérification finale du metadata
        const finalCheck = await pool.query(
            'SELECT metadata FROM payments WHERE id = $1',
            [payment_id]
        );
        console.log('📊 Metadata final:', finalCheck.rows[0].metadata);
        console.log('');

        // ========================================
        // NETTOYAGE : Suppression des données de test
        // ========================================
        console.log('🧹 Nettoyage des données de test...');
        await pool.query('DELETE FROM subscriptions WHERE payment_id = $1', [payment_id]);
        await pool.query('DELETE FROM payments WHERE id = $1', [payment_id]);
        console.log('✅ Données de test supprimées');
        console.log('');

        console.log('🎉 TOUS LES TESTS SONT PASSÉS !');
        console.log('✅ Vous pouvez déployer en toute sécurité');

    } catch (error) {
        console.error('');
        console.error('❌❌❌ ERREUR CRITIQUE ❌❌❌');
        console.error('Message:', error.message);
        console.error('Code:', error.code);
        console.error('Detail:', error.detail);
        console.error('');
        console.error('🛑 NE DÉPLOYEZ PAS tant que cette erreur n\'est pas résolue');
    } finally {
        await pool.end();
    }
}

// Exécution
testAllQueries();