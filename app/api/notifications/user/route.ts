/**
 * @swagger
 * /api/notifications/user:
 *   get:
 *     summary: Récupérer les notifications de l'utilisateur connecté
 *     description: >
 *       Retourne les notifications actives destinées à l'utilisateur connecté
 *       (personnelles ou globales), avec pagination et nombre de notifications non lues.
 *     tags: [ ADMIN]
 *     security:
 *       - bearerAuth: []

 */




import {getUserFromRequest} from "@/lib/auth";
import {NextRequest, NextResponse} from "next/server";
import {query} from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page') || 1);
        const limit = Number(searchParams.get('limit') || 10);
        const offset = (page - 1) * limit;

        // Déterminer si l'utilisateur est admin
        const isAdmin = user.role === 'admin';


        let whereCondition = '';
        let queryParams = [];

        if (isAdmin) {
            // Admin : notifications où destinataire_id = son ID
            whereCondition = 'nd.destinataire_id = $1';
            queryParams = [user.id, limit, offset];
        } else {
            // User normal (Parent ou Driver): notifications globales (destinataire_id IS NULL)
            whereCondition = 'nd.destinataire_id IS NULL';
            queryParams = [limit, offset];
        }

        // Notifications paginées
        const notificationsQuery = `
            SELECT
                n.*,
                u.name AS emetteur_nom,
                nd.lu,
                nd.date_lecture
            FROM notifications n
            INNER JOIN notification_destinataires nd ON n.id = nd.notification_id
            LEFT JOIN users u ON u.id = n.emetteur_id
            WHERE n.statut = 'active'
              AND ${whereCondition}
            ORDER BY n.date_creation DESC
            LIMIT $${isAdmin ? 2 : 1} OFFSET $${isAdmin ? 3 : 2}
        `;

        const notificationsResult = await query(notificationsQuery, queryParams);

        // Nombre de non lues
        const unreadQuery = `
            SELECT COUNT(*) AS unread
            FROM notification_destinataires nd
            INNER JOIN notifications n ON n.id = nd.notification_id
            WHERE ${whereCondition}
              AND nd.lu = false
              AND n.statut = 'active'
        `;

        const unreadParams = isAdmin ? [user.id] : [];
        const unreadResult = await query(unreadQuery, unreadParams);

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