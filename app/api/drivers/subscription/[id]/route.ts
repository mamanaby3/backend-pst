import {NextRequest, NextResponse} from "next/server";
import {getUserFromRequest} from "@/lib/auth";
import {query} from "@/lib/db";

/**
 * @swagger
 * /api/drivers/subscription:
 *   delete:
 *     summary: Annuler l'abonnement
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
