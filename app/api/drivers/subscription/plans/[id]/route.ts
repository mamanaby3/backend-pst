
import {NextRequest, NextResponse} from "next/server";
import {getUserFromRequest} from "@/lib/auth";
import {query} from "@/lib/db";

/**
 * @swagger
 * /api/drivers/subscription/plans/{id}:
 *   delete:
 *     summary: Supprimer une méthode de paiement
 *     tags: [CHAUFFEUR]
 */

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        const { id } = await params;

        const result = await query(
            `
            DELETE FROM saved_payment_methods
            WHERE id = $1 AND user_id = $2
            RETURNING *
            `,
            [id, user.id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Méthode de paiement introuvable" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Méthode de paiement supprimée avec succès"
        });

    } catch (error: any) {
        console.error("Erreur DELETE payment method:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

/**
 * @swagger
 * /api/drivers/subscription/plans/{id}:
 *   put:
 *     summary: Définir une méthode comme par défaut
 *     tags: [CHAUFFEUR ]
 */

export async function PUT_SET_DEFAULT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        const { id } = await params;

        // Vérifier que la méthode appartient à l'utilisateur
        const checkResult = await query(
            `SELECT id FROM saved_payment_methods WHERE id = $1 AND user_id = $2`,
            [id, user.id]
        );

        if (checkResult.rowCount === 0) {
            return NextResponse.json(
                { success: false, message: "Méthode de paiement introuvable" },
                { status: 404 }
            );
        }

        // Le trigger se charge de désactiver les autres méthodes
        await query(
            `
            UPDATE saved_payment_methods
            SET is_default = true
            WHERE id = $1 AND user_id = $2
            `,
            [id, user.id]
        );

        return NextResponse.json({
            success: true,
            message: "Méthode de paiement définie par défaut"
        });

    } catch (error: any) {
        console.error("Erreur SET DEFAULT:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
