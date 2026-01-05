import {NextRequest, NextResponse} from "next/server";
import {query} from "@/lib/db";
import {getUserFromRequest} from "@/lib/auth";

type Params = {
    params: Promise<{ id: string }>;
};
export async function GET(
    request: NextRequest,
    context: Params
) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const notificationId = await context.params;

        // Récupérer la notification
        const notifResult = await query(
            `SELECT
                n.*,
                u.name as emetteur_nom
             FROM notifications n
             LEFT JOIN users u ON n.emetteur_id = u.id
             WHERE n.id = $1`,
            [notificationId]
        );

        if (notifResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'Notification non trouvée' },
                { status: 404 }
            );
        }

        // Récupérer les destinataires
        const destResult = await query(
            `SELECT
                nd.*,
                  u.name as destinataire_nom
             FROM notification_destinataires nd
             LEFT JOIN users u ON nd.destinataire_id = u.id
             WHERE nd.notification_id = $1`,
            [notificationId]
        );

        const notification = notifResult.rows[0];
        notification.destinataires = destResult.rows;

        return NextResponse.json(notification);
    } catch (error) {
        console.error('Erreur récupération notification:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}


//   SUPPRIMER NOTIFICATION
export async function DELETE_NOTIF(
    request: NextRequest,
    context: Params
) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const notificationId = await context.params;


        await query(
            `UPDATE notifications SET statut = 'inactive' WHERE id = $1`,
            [notificationId]
        );

        return NextResponse.json({
            success: true,
            message: 'Notification supprimée avec succès'
        });
    } catch (error) {
        console.error('Erreur suppression notification:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}