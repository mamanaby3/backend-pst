import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

/**
 * @swagger
 * /api/drivers/subscription/renew:
 *   post:
 *     summary: Renouveler l'abonnement
 *     tags: [CHAUFFEUR]
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
            subscription_id,
            use_saved_payment = false,
            saved_payment_method_id,
            // Ou nouvelles infos de paiement
            payment_method,
            card_holder_name,
            card_number,
            card_cvv,
            card_exp_month,
            card_exp_year,
            mobile_number,
            mobile_provider
        } = body;

        // Validation
        if (!subscription_id) {
            return NextResponse.json(
                { success: false, message: "ID d'abonnement requis" },
                { status: 400 }
            );
        }

        // Récupérer l'abonnement actuel
        const currentSubResult = await query(
            `
            SELECT s.*, sp.name as plan_name, sp.price, sp.duration_days
            FROM subscriptions s
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.id = $1 AND s.user_id = $2
            `,
            [subscription_id, user.id]
        );

        if (currentSubResult.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Abonnement introuvable" },
                { status: 404 }
            );
        }

        const currentSub = currentSubResult.rows[0];

        await query('BEGIN');

        try {
            let paymentData: any = {
                user_id: user.id,
                amount: currentSub.price,
                status: 'pending',
                method: payment_method || 'card',
                payment_type: 'subscription_renewal',
                transaction_id: `RNW-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };

            // 1. Utiliser une méthode de paiement sauvegardée
            if (use_saved_payment && saved_payment_method_id) {
                const savedMethodResult = await query(
                    `SELECT * FROM saved_payment_methods WHERE id = $1 AND user_id = $2`,
                    [saved_payment_method_id, user.id]
                );

                if (savedMethodResult.rowCount === 0) {
                    throw new Error("Méthode de paiement sauvegardée introuvable");
                }

                const savedMethod = savedMethodResult.rows[0];

                if (savedMethod.method_type === 'card') {
                    paymentData = {
                        ...paymentData,
                        method: 'card',
                        card_holder_name: savedMethod.card_holder_name,
                        card_last4: savedMethod.card_last4,
                        card_exp_month: savedMethod.card_exp_month,
                        card_exp_year: savedMethod.card_exp_year,
                        payment_token: savedMethod.card_token,
                        payment_provider: 'PayTech'
                    };
                } else if (savedMethod.method_type === 'mobile_money') {
                    paymentData = {
                        ...paymentData,
                        method: savedMethod.mobile_provider,
                        mobile_number: savedMethod.mobile_number,
                        payment_provider: savedMethod.mobile_provider
                    };
                }
            }
            // 2. Ou utiliser de nouvelles infos de paiement
            else {
                if (payment_method === 'card') {
                    if (!card_holder_name || !card_number || !card_cvv || !card_exp_month || !card_exp_year) {
                        throw new Error("Informations de carte bancaire incomplètes");
                    }

                    const card_last4 = card_number.replace(/\s/g, '').slice(-4);
                    const payment_token = `tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                    paymentData = {
                        ...paymentData,
                        card_holder_name,
                        card_last4,
                        card_exp_month,
                        card_exp_year,
                        payment_token,
                        payment_provider: 'PayTech'
                    };
                } else if (payment_method === 'mobile_money') {
                    if (!mobile_number || !mobile_provider) {
                        throw new Error("Informations de mobile money incomplètes");
                    }

                    paymentData = {
                        ...paymentData,
                        method: mobile_provider,
                        mobile_number,
                        payment_provider: mobile_provider
                    };
                }
            }

            // 3. Créer le paiement
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

            // 4. Mettre à jour l'abonnement (prolonger la date de fin)
            const newEndDate = currentSub.end_date > new Date()
                ? `'${currentSub.end_date}'::DATE + ${currentSub.duration_days}`
                : `CURRENT_DATE + ${currentSub.duration_days}`;

            const renewalResult = await query(
                `
                UPDATE subscriptions
                SET 
                    end_date = ${newEndDate},
                    active = true,
                    payment_id = $1,
                    updated_at = now()
                WHERE id = $2
                RETURNING *
                `,
                [payment_id, subscription_id]
            );

            // 5. Simuler le traitement du paiement
            await query(
                `UPDATE payments SET status = 'paid' WHERE id = $1`,
                [payment_id]
            );

            await query('COMMIT');

            // 6. Notification
            const notifResult = await query(
                `
                INSERT INTO notifications (libelle, type, description, emetteur_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                `,
                [
                    'Abonnement renouvelé',
                    'subscription_renewed',
                    `Votre abonnement ${currentSub.plan_name} a été renouvelé avec succès`,
                    user.id
                ]
            );

            await query(
                `INSERT INTO notification_destinataires (notification_id, destinataire_id)
                 VALUES ($1, $2)`,
                [notifResult.rows[0].id, user.id]
            );

            return NextResponse.json({
                success: true,
                message: "Abonnement renouvelé avec succès",
                data: {
                    subscription: renewalResult.rows[0],
                    payment: {
                        id: payment_id,
                        transaction_id: paymentData.transaction_id,
                        amount: paymentData.amount,
                        status: 'paid'
                    }
                }
            });

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error: any) {
        console.error("Erreur renouvellement abonnement:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}