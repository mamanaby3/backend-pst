
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        console.log("=== WEBHOOK PAYTECH ===");
        console.log(JSON.stringify(body, null, 2));

        const {
            ref_command,      // Transaction ID
            item_price,       // Montant
            payment_method,   // Méthode de paiement
            payment_status,   // "success" ou "cancelled"
            type_event        // Type d'événement
        } = body;

        // Vérifie si le paiement est réussi
        if (payment_status === "success" && type_event === "sale_complete") {

            // Met à jour le statut du paiement
            const updateResult = await query(
                `UPDATE payments
                 SET status = 'completed', updated_at = NOW()
                 WHERE transaction_id = $1
                     RETURNING id, user_id`,
                [ref_command]
            );

            //  Correction TypeScript : vérification de null
            if (updateResult && updateResult.rowCount && updateResult.rowCount > 0) {
                const payment = updateResult.rows[0];

                // Active l'abonnement
                await query(
                    `UPDATE subscriptions
                     SET active = true, start_date = NOW()
                     WHERE payment_id = $1`,
                    [payment.id]
                );

                console.log(`  Paiement confirmé et abonnement activé pour user ${payment.user_id}`);
            } else {
                console.warn(`   Transaction ${ref_command} introuvable`);
            }

        } else if (payment_status === "cancelled") {
            // Paiement annulé
            await query(
                `UPDATE payments
                 SET status = 'cancelled', updated_at = NOW()
                 WHERE transaction_id = $1`,
                [ref_command]
            );
            console.log(`  Paiement ${ref_command} annulé`);
        }

        // Toujours retourner 200 OK à PayTech
        return NextResponse.json({
            success: true,
            message: "Webhook traité"
        });

    } catch (err: any) {
        console.error("  Erreur webhook PayTech:", err);

        // Retourne quand même 200 pour éviter les retry de PayTech
        return NextResponse.json({
            success: false,
            error: err.message
        }, { status: 200 });
    }
}