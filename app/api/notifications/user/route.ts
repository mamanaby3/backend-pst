import {getUserFromRequest} from "@/lib/auth";
import {NextRequest, NextResponse} from "next/server";
import {query} from "@/lib/db";

export async function GET_USER_NOTIFS(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page') || 1);
        const limit = Number(searchParams.get('limit') || 10);
        const offset = (page - 1) * limit;

        // Notifications paginées
        const notificationsResult = await query(
            `SELECT
                n.*,
                CONCAT(u.nom, ' ', u.prenom) AS emetteur_nom,
                nd.lu,
                nd.date_lecture
             FROM notifications n
             INNER JOIN notification_destinataires nd ON n.id = nd.notification_id
             LEFT JOIN users u ON u.id = n.emetteur_id
             WHERE n.statut = 'active'
               AND (nd.destinataire_id = $1 OR nd.destinataire_id IS NULL)
             ORDER BY n.date_creation DESC
             LIMIT $2 OFFSET $3`,
            [user.id, limit, offset]
        );

        // Nombre de non lues
        const unreadResult = await query(
            `SELECT COUNT(*) AS unread
             FROM notification_destinataires nd
             INNER JOIN notifications n ON n.id = nd.notification_id
             WHERE (nd.destinataire_id = $1 OR nd.destinataire_id IS NULL)
               AND nd.lu = false
               AND n.statut = 'active'`,
            [user.id]
        );

        return NextResponse.json({
            notifications: notificationsResult.rows,
            unreadCount: Number(unreadResult.rows[0].unread),
            pagination: { page, limit }
        });
    } catch (error) {
        console.error('Erreur notifications utilisateur:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}