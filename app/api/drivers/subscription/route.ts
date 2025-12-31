// ========================================
// FILE: app/api/drivers/subscription/route.ts
// ========================================

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

/**
 * @swagger
 * /api/drivers/subscription:
 *   get:
 *     summary: Voir mon abonnement actif
 *     tags: [CHAUFFEUR - Abonnement]
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        // Récupérer l'abonnement actif avec détails du paiement
        const subscription = await query(
            `
            SELECT 
                s.*,
                sp.name as plan_name,
                sp.description as plan_description,
                sp.features as plan_features,
                (s.end_date - CURRENT_DATE) as days_remaining,
                CASE 
                    WHEN s.end_date < CURRENT_DATE THEN 'expired'
                    WHEN s.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'
                    ELSE 'active'
                END as subscription_status,
                p.id as payment_id,
                p.amount as payment_amount,
                p.method as payment_method,
                p.status as payment_status,
                p.created_at as payment_date,
                p.transaction_id
            FROM subscriptions s
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            LEFT JOIN payments p ON s.payment_id = p.id
            WHERE s.user_id = $1
              AND s.active = true
            ORDER BY s.created_at DESC
            LIMIT 1
            `,
            [user.id]
        );

        // Récupérer l'historique des abonnements
        const history = await query(
            `
            SELECT 
                s.id,
                s.type,
                s.price,
                s.start_date,
                s.end_date,
                s.active,
                s.canceled_at,
                p.method as payment_method,
                p.status as payment_status
            FROM subscriptions s
            LEFT JOIN payments p ON s.payment_id = p.id
            WHERE s.user_id = $1
            ORDER BY s.created_at DESC
            LIMIT 10
            `,
            [user.id]
        );

        return NextResponse.json({
            success: true,
            data: {
                current: subscription.rows[0] || null,
                history: history.rows
            }
        });

    } catch (error: any) {
        console.error("Erreur GET subscription:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

/**
 * @swagger
 * /api/drivers/subscription:
 *   post:
 *     summary: Souscrire à un abonnement avec paiement
 *     tags: [CHAUFFEUR - Abonnement]
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const {
            plan_id,
            payment_method, // 'card' ou 'mobile_money'
            auto_renew = false,

            // Pour carte bancaire
            card_holder_name,
            card_number,
            card_cvv,
            card_exp_month,
            card_exp_year,
            save_card = false,

            // Pour mobile money
            mobile_number,
            mobile_provider,
            save_mobile = false
        } = body;

        // Validation
        if (!plan_id || !payment_method) {
            return NextResponse.json(
                { success: false, message: "Plan et méthode de paiement requis" },
                { status: 400 }
            );
        }

        // Récupérer les détails du plan
        const planResult = await query(
            `SELECT * FROM subscription_plans WHERE id = $1 AND active = true`,
            [plan_id]
        );

        if (planResult.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Plan d'abonnement introuvable" },
                { status: 404 }
            );
        }

        const plan = planResult.rows[0];

        // Validation selon la méthode de paiement
        if (payment_method === 'card') {
            if (!card_holder_name || !card_number || !card_cvv || !card_exp_month || !card_exp_year) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Informations de carte bancaire incomplètes",
                        required: ['card_holder_name', 'card_number', 'card_cvv', 'card_exp_month', 'card_exp_year']
                    },
                    { status: 400 }
                );
            }

            // Validation basique du numéro de carte (Luhn algorithm peut être ajouté)
            if (card_number.replace(/\s/g, '').length < 13 || card_number.replace(/\s/g, '').length > 19) {
                return NextResponse.json(
                    { success: false, message: "Numéro de carte invalide" },
                    { status: 400 }
                );
            }

            // Validation CVV
            if (card_cvv.length < 3 || card_cvv.length > 4) {
                return NextResponse.json(
                    { success: false, message: "CVV invalide" },
                    { status: 400 }
                );
            }

            // Validation date d'expiration
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;

            if (card_exp_year < currentYear || (card_exp_year === currentYear && card_exp_month < currentMonth)) {
                return NextResponse.json(
                    { success: false, message: "Carte expirée" },
                    { status: 400 }
                );
            }

        } else if (payment_method === 'mobile_money') {
            if (!mobile_number || !mobile_provider) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Informations de mobile money incomplètes",
                        required: ['mobile_number', 'mobile_provider']
                    },
                    { status: 400 }
                );
            }

            // Validation du numéro de téléphone sénégalais
            const phoneRegex = /^(\+221|221)?[73][0-9]{8}$/;
            if (!phoneRegex.test(mobile_number.replace(/\s/g, ''))) {
                return NextResponse.json(
                    { success: false, message: "Numéro de téléphone invalide" },
                    { status: 400 }
                );
            }

            // Validation du provider
            const validProviders = ['Wave', 'Orange Money', 'Free Money', 'YUP', 'Wizall'];
            if (!validProviders.includes(mobile_provider)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Opérateur mobile money invalide",
                        valid_providers: validProviders
                    },
                    { status: 400 }
                );
            }
        }

        // Transaction de base de données
        await query('BEGIN');

        try {
            // 1. Désactiver les abonnements actifs existants
            await query(
                `UPDATE subscriptions SET active = false WHERE user_id = $1 AND active = true`,
                [user.id]
            );

            // 2. Créer le paiement
            let paymentData: any = {
                user_id: user.id,
                amount: plan.price,
                status: 'pending',
                method: payment_method,
                payment_type: 'subscription',
                transaction_id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };

            if (payment_method === 'card') {
                const card_last4 = card_number.replace(/\s/g, '').slice(-4);

                // ⚠️ ATTENTION: Ne JAMAIS stocker le numéro complet ou le CVV en production
                // Utilisez un processeur de paiement (Stripe, PayTech, etc.) qui génère un token
                const payment_token = `tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                paymentData = {
                    ...paymentData,
                    card_holder_name,
                    card_last4,
                    card_exp_month,
                    card_exp_year,
                    payment_token,
                    payment_provider: 'PayTech' // Exemple
                };
            }  else if (payment_method === 'mobile_money') {
            paymentData = {
                ...paymentData,
                mobile_number,
                method: mobile_provider, // <- ici on met directement Wave, Orange Money, etc.
                payment_provider: mobile_provider
            };
        }


        const paymentResult = await query(
                `
                INSERT INTO payments (
                    user_id, amount, status, method, payment_type, 
                    transaction_id, card_holder_name, card_last4, 
                    card_exp_month, card_exp_year, mobile_number, 
                    payment_token, payment_provider
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
                `,
                [
                    paymentData.user_id,
                    paymentData.amount,
                    paymentData.status,
                    paymentData.method,
                    paymentData.payment_type,
                    paymentData.transaction_id,
                    paymentData.card_holder_name || null,
                    paymentData.card_last4 || null,
                    paymentData.card_exp_month || null,
                    paymentData.card_exp_year || null,
                    paymentData.mobile_number || null,
                    paymentData.payment_token || null,
                    paymentData.payment_provider || null
                ]
            );

            const payment_id = paymentResult.rows[0].id;

            // 3. Créer l'abonnement
            const subscriptionResult = await query(
                `
                INSERT INTO subscriptions (
                    user_id, plan_id, type, price, 
                    start_date, end_date, 
                    active, auto_renew, payment_id
                )
                VALUES (
                    $1, $2, $3, $4,
                    CURRENT_DATE,
                    CURRENT_DATE + ($5 || ' days')::INTERVAL,
                    true, $6, $7
                )
                RETURNING *
                `,
                [user.id, plan_id, plan.name, plan.price, plan.duration_days, auto_renew, payment_id]
            );

            // 4. Sauvegarder la méthode de paiement si demandé
            if ((payment_method === 'card' && save_card) || (payment_method === 'mobile_money' && save_mobile)) {
                const savedMethodData: any = {
                    user_id: user.id,
                    method_type: payment_method
                };

                if (payment_method === 'card') {
                    const card_brand = detectCardBrand(card_number);
                    savedMethodData.card_holder_name = card_holder_name;
                    savedMethodData.card_last4 = paymentData.card_last4;
                    savedMethodData.card_brand = card_brand;
                    savedMethodData.card_exp_month = card_exp_month;
                    savedMethodData.card_exp_year = card_exp_year;
                    savedMethodData.card_token = paymentData.payment_token;
                    savedMethodData.nickname = `${card_brand} ****${paymentData.card_last4}`;
                } else {
                    savedMethodData.mobile_number = mobile_number;
                    savedMethodData.mobile_provider = mobile_provider;
                    savedMethodData.nickname = `${mobile_provider} ${mobile_number}`;
                }

                await query(
                    `
                    INSERT INTO saved_payment_methods (
                        user_id, method_type, card_holder_name, card_last4,
                        card_brand, card_exp_month, card_exp_year, card_token,
                        mobile_number, mobile_provider, nickname, is_default
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
                    ON CONFLICT DO NOTHING
                    `,
                    [
                        savedMethodData.user_id,
                        savedMethodData.method_type,
                        savedMethodData.card_holder_name || null,
                        savedMethodData.card_last4 || null,
                        savedMethodData.card_brand || null,
                        savedMethodData.card_exp_month || null,
                        savedMethodData.card_exp_year || null,
                        savedMethodData.card_token || null,
                        savedMethodData.mobile_number || null,
                        savedMethodData.mobile_provider || null,
                        savedMethodData.nickname
                    ]
                );
            }

            //   Simuler le traitement du paiement (à remplacer par une vraie intégration) a faire
            // En production, appelez l'API de mon processeur de paiement ici(wave....)

            // Mise à jour du statut du paiement en "paid" (simulation)
            await query(
                `UPDATE payments SET status = 'paid' WHERE id = $1`,
                [payment_id]
            );

            await query('COMMIT');

            // 6. Envoyer une notification
            const notifResult = await query(
                `
                INSERT INTO notifications (libelle, type, description, emetteur_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                `,
                [
                    'Abonnement activé',
                    'subscription_activated',
                    `Votre abonnement ${plan.name} a été activé avec succès`,
                    user.id
                ]
            );

            await query(
                `
                INSERT INTO notification_destinataires (notification_id, destinataire_id)
                VALUES ($1, $2)
                `,
                [notifResult.rows[0].id, user.id]
            );

            return NextResponse.json(
                {
                    success: true,
                    message: "Abonnement souscrit et paiement effectué avec succès",
                    data: {
                        subscription: subscriptionResult.rows[0],
                        payment: {
                            id: payment_id,
                            transaction_id: paymentData.transaction_id,
                            amount: paymentData.amount,
                            method: paymentData.method,
                            status: 'paid'
                        }
                    }
                },
                { status: 201 }
            );

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error: any) {
        console.error("Erreur POST subscription:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

/**
 * @swagger
 * /api/drivers/subscription:
 *   delete:
 *     summary: Annuler l'abonnement
 *     tags: [CHAUFFEUR - Abonnement]
 */
export async function DELETE(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        const result = await query(
            `
            UPDATE subscriptions
            SET active = false, canceled_at = now(), auto_renew = false
            WHERE user_id = $1 AND active = true
            RETURNING *
            `,
            [user.id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Aucun abonnement actif trouvé" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Abonnement annulé avec succès. Il restera actif jusqu'à la date d'expiration.",
            data: result.rows[0]
        });

    } catch (error: any) {
        console.error("Erreur DELETE subscription:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

/**
 * Détecter le type de carte bancaire à partir du numéro
 */
function detectCardBrand(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s/g, '');

    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'American Express';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';

    return 'Unknown';
}