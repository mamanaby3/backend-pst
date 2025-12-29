import {getUserFromRequest} from "@/lib/auth";
import {NextRequest, NextResponse} from "next/server";
import {query} from "@/lib/db";

/**
 * @swagger
 * /api/drivers/dashboard:
 *   get:
 *     summary: Récupérer les données du tableau de bord chauffeur
 *     tags: [CHAUFFEUR]
 *     security:
 *       - bearerAuth: []
 */


export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== 'driver') {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        // 1️⃣ Récupérer le driver
        const driverResult = await query(
            `SELECT id, status FROM drivers WHERE user_id = $1`,
            [user.id]
        );

        if (driverResult.rowCount === 0) {
            return NextResponse.json(
                { error: 'Chauffeur introuvable' },
                { status: 404 }
            );
        }

        if (driverResult.rows[0].status !== 'Approuvé') {
            return NextResponse.json(
                { error: 'Chauffeur non approuvé' },
                { status: 403 }
            );
        }

        const driverId = driverResult.rows[0].id;


        const trips = await query(
            `
  SELECT
    id,
    start_point,
    end_point,
    departure_time,
    capacity_max,
    status
  FROM trips
  WHERE driver_id = $1
    AND  departure_time > NOW()
    AND status = 'pending'
  ORDER BY departure_time ASC
  `,
            [driverId]
        );




    //     // Notifications non lues
    //     const notifications = await query(
    //         `SELECT COUNT(*) as unread
    //          FROM notification_destinataires nd
    //          INNER JOIN notifications n ON n.id = nd.notification_id
    //          WHERE nd.destinataire_id = $1
    //            AND nd.lu = false
    //            AND n.statut = 'active'`,
    //         [user.id]
    //     );
    //
    //     // Statistiques du jour
    //     const statsJour = await query(
    //         `SELECT
    //             COUNT(DISTINCT t.id) as trajets_du_jour,
    //             COUNT(DISTINCT r.id) as reservations_du_jour,
    //             SUM(t.distance_km) as km_du_jour
    //          FROM trajets t
    //          LEFT JOIN reservations r ON r.trajet_id = t.id AND r.statut != 'annulee'
    //          WHERE t.chauffeur_id = $1
    //            AND t.date_depart = CURRENT_DATE`,
    //         [user.id]
    //     );
    //
    //     // Abonnement actif
    //     const abonnement = await query(
    //         `SELECT * FROM abonnements
    //          WHERE chauffeur_id = $1
    //            AND statut = 'actif'
    //            AND date_fin >= CURRENT_DATE
    //          ORDER BY date_fin DESC
    //          LIMIT 1`,
    //         [user.id]
    //     );
    //
    //     return NextResponse.json({
    //           trips: trips.rows,
    //         notificationsNonLues: Number(notifications.rows[0].unread),
    //         statistiques: statsJour.rows[0],
    //         abonnement: abonnement.rows[0] || null
    //     });
    // } catch (error) {
    //     console.error('Erreur dashboard chauffeur:', error);
    //     return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    // }
        //   Notifications non lues
        const notifications = await query(
            `
      SELECT COUNT(*) AS unread
      FROM notification_destinataires nd
      INNER JOIN notifications n ON n.id = nd.notification_id
      WHERE (nd.destinataire_id = $1 OR nd.destinataire_id IS NULL)
        AND nd.lu = false
        AND n.statut = 'active'
      `,
            [user.id]
        );

        return NextResponse.json({
            trips: trips.rows,
            notificationsNonLues: Number(notifications.rows[0].unread)
        });
} catch (error) {
    console.error('Erreur dashboard chauffeur:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
}
}