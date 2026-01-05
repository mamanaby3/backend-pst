import {NextRequest, NextResponse} from "next/server";
import {getUserFromRequest} from "@/lib/auth";
import {query} from "@/lib/db";

/**
 * @swagger
 * /api/drivers/subscription/{id}:
 *   post:
 *     summary: Résilier l'abonnement
 *     tags: [CHAUFFEUR]
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

        const body = await request.json();
        const { subscription_id, reason, cancel_immediately = false } = body;

        if (!subscription_id) {
            return NextResponse.json(
                { success: false, message: "ID d'abonnement requis" },
                { status: 400 }
            );
        }

        // Récupérer l'abonnement
        const subResult = await query(
            `
            SELECT s.*, sp.name as plan_name
            FROM subscriptions s
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.id = $1 AND s.user_id = $2 AND s.active = true
            `,
            [subscription_id, user.id]
        );

        if (subResult.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Abonnement actif introuvable" },
                { status: 404 }
            );
        }

        const subscription = subResult.rows[0];

        await query('BEGIN');

        try {
            if (cancel_immediately) {
                // Résiliation immédiate
                await query(
                    `
                    UPDATE subscriptions
                    SET 
                        active = false,
                        auto_renew = false,
                        canceled_at = now(),
                        cancellation_reason = $1,
                        updated_at = now()
                    WHERE id = $2
                    `,
                    [reason || 'Résiliation à la demande de l\'utilisateur', subscription_id]
                );
            } else {
                // Résiliation à la fin de la période
                await query(
                    `
                    UPDATE subscriptions
                    SET 
                        auto_renew = false,
                        canceled_at = now(),
                        cancellation_reason = $1,
                        updated_at = now()
                    WHERE id = $2
                    `,
                    [reason || 'Résiliation programmée', subscription_id]
                );
            }

            await query('COMMIT');

            // Notification
            const notifResult = await query(
                `
                INSERT INTO notifications (libelle, type, description, emetteur_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                `,
                [
                    'Abonnement résilié',
                    'subscription_canceled',
                    cancel_immediately
                        ? `Votre abonnement ${subscription.plan_name} a été résilié immédiatement`
                        : `Votre abonnement ${subscription.plan_name} sera résilié à la fin de la période en cours`,
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
                message: cancel_immediately
                    ? "Abonnement résilié immédiatement"
                    : "Abonnement programmé pour résiliation à la fin de la période",
                data: {
                    subscription_id,
                    canceled_at: new Date(),
                    active_until: cancel_immediately ? new Date() : subscription.end_date
                }
            });

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error: any) {
        console.error("Erreur résiliation abonnement:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}