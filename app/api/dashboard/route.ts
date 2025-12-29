

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Récupérer les statistiques du tableau de bord
 *     tags: [ADMIN]

 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
    try {
        //  Nombre de parents
        const parentsRes = await query(`
            SELECT COUNT(*)::int AS total
            FROM users
            WHERE role = 'parent'
        `);

        //  Nombre de chauffeurs
        const driversRes = await query(`
            SELECT COUNT(*)::int AS total
            FROM users
            WHERE role = 'driver'
        `);

        //  Nombre d’enfants
        const childrenRes = await query(`
            SELECT COUNT(*)::int AS total
            FROM children
        `);
        //  Nombre de parents et enfants
        const parentCount = await query(`SELECT COUNT(*) AS total FROM users WHERE role='parent'`);
        const childrenCount = await query(`SELECT COUNT(*) AS total FROM children`);

        // Nombre de chauffeurs
        const driverCount = await query(`SELECT COUNT(*) AS total FROM users WHERE role='driver'`);

        //  Statistiques des trajets
        const tripStats = await query(
            `SELECT status, COUNT(*) AS total FROM trips GROUP BY status`);

        // Revenus mensuels  somme des paiements PAYÉS par mois
        const revenueMonthly = await query(`
            SELECT
                to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
             COALESCE(SUM(amount), 0) AS total
            FROM payments
            WHERE status = 'paid'
            GROUP BY date_trunc('month', created_at)
            ORDER BY date_trunc('month', created_at); 
        `);  // Revenus mensuels  somme des paiements PAYÉS par mois

        const repartitionPayment = await query(`  
         SELECT
        CASE
        WHEN method = 'Carte Bancaire' THEN 'Carte Bancaire'
        WHEN method IN ('Wave', 'Orange Money', 'Yas Money', 'Kay Pay') THEN 'Mobile Money'
        WHEN method = 'cash' THEN 'Espèces'
        ELSE 'Autre'
        END AS payment_type,
        COUNT(*) AS total_transactions,
            COALESCE(SUM(amount), 0) AS total_amount
        FROM payments
        WHERE status = 'paid'
        AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
        GROUP BY payment_type
        ORDER BY total_amount DESC `
    );
        const revenueMonthlyEnCours = await query(`
            SELECT
                to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
            COALESCE(SUM(amount), 0) AS total
            FROM payments
            WHERE status = 'paid'
              AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
            GROUP BY date_trunc('month', created_at)
        `);

        // Trajets du jour (total)
        const tripsToday = await query(`
            SELECT COUNT(*) AS total
            FROM trips
            WHERE DATE(created_at) = CURRENT_DATE
        `);

      // Trajets terminés aujourd’hui
        const tripsCompletedToday = await query(`
            SELECT COUNT(*) AS total
            FROM trips
            WHERE status = 'completed'
              AND DATE(created_at) = CURRENT_DATE
        `);

       // Trajets annulés aujourd’hui
        const tripsCanceledToday = await query(`
            SELECT COUNT(*) AS total
            FROM trips
            WHERE status = 'canceled'
              AND DATE(created_at) = CURRENT_DATE
        `);

        // Abonnements actifs
        const activeSubscriptions = await query(`
            SELECT COUNT(*)::int AS total
            FROM subscriptions
            WHERE active = true
              AND start_date <= CURRENT_DATE
              AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        `);

        // Montant moyen par abonnement
        const avgSubscription = await query(
            `SELECT
                 ROUND(AVG(price), 2) AS montant_moyen_abonnement
             FROM subscriptions
             WHERE active = true
               AND start_date <= CURRENT_DATE
               AND (end_date IS NULL OR end_date >= CURRENT_DATE);
            `);
       // Nombre d'écoles partenaires
        const schoolsCount = await query(
            `SELECT COUNT(*) AS total FROM schools WHERE status = 'Actif'`
        );


        // Croissance des abonnements par mois
        const subscriptionsGrowth = await query(`
            SELECT
                date_trunc('month', created_at) AS month,
    COUNT(*)::int AS total
            FROM subscriptions
            WHERE active = true
            GROUP BY 1
            ORDER BY 1 ASC
        `);

        //  Croissance : comparaison mois courant vs mois précédent
        const growthRate = await query(`
            WITH this_month AS (
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM payments
                WHERE status = 'paid'
                  AND created_at >= date_trunc('month', CURRENT_DATE)
                  AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
                ),
                last_month AS (
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM payments
            WHERE status = 'paid'
              AND created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
              AND created_at < date_trunc('month', CURRENT_DATE)
                )
            SELECT
                this_month.total AS this_month,
                last_month.total AS last_month,
                CASE
                    WHEN last_month.total = 0 THEN 0
                    ELSE ROUND(
                            ((this_month.total - last_month.total) / last_month.total) * 100,
                            2
                         )
                    END AS growth_rate
            FROM this_month, last_month;


        `);

          // Paiements en attente
        const pendingPayments = await query(`
            SELECT
                COUNT(*) AS total_pending,
                COALESCE(SUM(amount), 0) AS total_amount
            FROM payments
            WHERE status = 'pending';
        `);
        //   Alertes incidents
        const incidentAlerts = await query(`SELECT * FROM incidents   ORDER BY created_at DESC LIMIT 10`);

        //liste des paiements
        const result = await query(`
            SELECT 
                p.id,
                u.name AS user_name,
                p.method,
                p.amount,
                p.created_at
            FROM payments p
            LEFT JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
        `);
        return NextResponse.json({
            success: true,
            users: {
                parents: parentsRes.rows[0].total,
                chauffeurs: driversRes.rows[0].total,
                enfants: childrenRes.rows[0].total,
            },
            parents: parseInt(parentCount.rows[0].total),
            children: parseInt(childrenCount.rows[0].total),
            drivers: parseInt(driverCount.rows[0].total),
            trips_today: parseInt(tripsToday.rows[0].total),
            trips_completed_today: parseInt(tripsCompletedToday.rows[0].total),
            trips_canceled_today: parseInt(tripsCanceledToday.rows[0].total),
            trips: tripStats.rows,
            schools: parseInt(schoolsCount.rows[0].total),
            revenue_monthly: revenueMonthly.rows,
            subscriptions_active: activeSubscriptions.rows[0].total,
            subscriptions_growth: subscriptionsGrowth.rows,
             avg_subscription: Number(avgSubscription.rows[0].montant_moyen_abonnement),
             revenueMonthlyEnCours : parseInt(revenueMonthlyEnCours.rows[0].total),
             growth: Number(growthRate.rows[0].growth_rate),
            pending_payments: pendingPayments.rows[0].total_amount,
            paymentMethods: repartitionPayment.rows,
            incidents: incidentAlerts.rows,
            result: result.rows
        });

    } catch (error: unknown) {
        console.error("Dashboard Error:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
