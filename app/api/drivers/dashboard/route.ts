import {getUserFromRequest} from "@/lib/auth";
import {NextRequest, NextResponse} from "next/server";
import {query} from "@/lib/db";

/**
 * @swagger
 * /api/drivers/dashboard:
 *   get:
 *     summary: Récupérer les données du tableau de bord chauffeur
 *     description: |
 *       Retourne toutes les informations nécessaires pour le dashboard du chauffeur:
 *       - Trajets à venir avec coordonnées des parents
 *       - Statistiques personnelles (trajets complétés, évaluations, etc.)
 *       - Notifications récentes (nouvelles réservations, rappels)
 *     tags: [CHAUFFEUR]
 *     security:
 *       - bearerAuth: []

 */
export async function GET(request: NextRequest) {
    try {
        //   Vérifier l'authentification et le rôle
        const user = await getUserFromRequest(request);

        if (!user || user.role !== 'driver') {
            return NextResponse.json(
                { error: 'Non autorisé' },
                { status: 403 }
            );
        }

        //   Récupérer le driver et vérifier son statut
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

        const driver = driverResult.rows[0];

        if (driver.status !== 'Approuvé') {
            return NextResponse.json(
                {
                    error: 'Votre compte chauffeur est en attente d\'approbation',
                    status: driver.status
                },
                { status: 403 }
            );
        }

        const driverId = driver.id;

        //  Trajets à venir avec TOUTES les informations nécessaires
        // Y compris les coordonnées des parents pour chaque enfant
        const upcomingTrips = await query(
            `
            SELECT 
                t.id,
                t.start_point,
                t.end_point,
                t.departure_time,
                t.capacity_max,
                t.status,
                t.is_recurring,
                s.name as school_name,
                s.address as school_address,
                s.opening_time,
                s.closing_time,
                COUNT(tc.child_id) as children_count,
                -- Agréger les informations des enfants et parents
                json_agg(
                    json_build_object(
                        'child_id', c.id,
                        'child_name', c.name,
                        'child_address', c.address,
                        'parent_id', u.id,
                        'parent_name', u.name,
                        'parent_phone', u.phone,
                        'parent_email', u.email,
                        'parent_address', u.address
                    )
                ) FILTER (WHERE c.id IS NOT NULL) as children_details
            FROM trips t
            LEFT JOIN schools s ON t.school_id = s.id
            LEFT JOIN trip_children tc ON t.id = tc.trip_id
            LEFT JOIN children c ON tc.child_id = c.id
            LEFT JOIN users u ON c.parent_id = u.id
            WHERE t.driver_id = $1
              AND t.departure_time > NOW()
              AND t.status = 'pending'
            GROUP BY t.id, s.id
            ORDER BY t.departure_time ASC
            LIMIT 10
            `,
            [driverId]
        );

        //   Statistiques complètes du chauffeur
        const stats = await query(
            `
            SELECT
                -- Statistiques des trajets
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_trips,
                COUNT(CASE WHEN t.status = 'canceled' THEN 1 END) as canceled_trips,
                COUNT(CASE WHEN t.status = 'pending' AND t.departure_time > NOW() THEN 1 END) as upcoming_trips,
                COUNT(CASE WHEN t.status = 'pending' AND t.departure_time < NOW() THEN 1 END) as missed_trips,
                
                -- Statistiques des évaluations
                COALESCE(AVG(e.rating), 0) as average_rating,
                COUNT(DISTINCT e.id) as total_evaluations,
                COUNT(CASE WHEN e.rating = 5 THEN 1 END) as five_star_count,
                COUNT(CASE WHEN e.rating = 4 THEN 1 END) as four_star_count,
                COUNT(CASE WHEN e.rating = 3 THEN 1 END) as three_star_count,
                COUNT(CASE WHEN e.rating <= 2 THEN 1 END) as low_rating_count,
                
                -- Statistiques des enfants transportés
                COUNT(DISTINCT tc.child_id) as total_children_transported,
                
                -- Statistiques du mois en cours
                COUNT(CASE 
                    WHEN t.status = 'completed' 
                    AND DATE_TRUNC('month', t.departure_time) = DATE_TRUNC('month', NOW()) 
                    THEN 1 
                END) as trips_this_month,
                
                -- Statistiques de la semaine en cours
                COUNT(CASE 
                    WHEN t.status = 'completed' 
                    AND t.departure_time >= DATE_TRUNC('week', NOW()) 
                    THEN 1 
                END) as trips_this_week
                
            FROM trips t
            LEFT JOIN evaluations e ON t.id = e.trip_id AND e.driver_id = $1
            LEFT JOIN trip_children tc ON t.id = tc.trip_id
            WHERE t.driver_id = $1
            `,
            [driverId]
        );

        //   Notifications récentes avec toutes les informations
        const notifications = await query(
            `
            SELECT 
                n.id,
                n.libelle,
                n.type,
                n.description,
                n.image_url,
                n.date_creation,
                n.statut,
                nd.lu,
                nd.date_lecture,
                u.name as emetteur_name,
                u.role as emetteur_role
            FROM notifications n
            INNER JOIN notification_destinataires nd ON n.id = nd.notification_id
            LEFT JOIN users u ON n.emetteur_id = u.id
            WHERE nd.destinataire_id = $1
              AND n.statut = 'active'
            ORDER BY n.date_creation DESC
            LIMIT 10
            `,
            [user.id]
        );

        // Compter les notifications non lues
        const unreadNotifications = await query(
            `
            SELECT COUNT(*) as unread_count
            FROM notification_destinataires nd
            INNER JOIN notifications n ON nd.notification_id = n.id
            WHERE nd.destinataire_id = $1
              AND nd.lu = false
              AND n.statut = 'active'
            `,
            [user.id]
        );

        //   Trajets du jour (pour accès rapide)
        const todayTrips = await query(
            `
            SELECT 
                t.id,
                t.start_point,
                t.end_point,
                t.departure_time,
                t.status,
                s.name as school_name,
                COUNT(tc.child_id) as children_count
            FROM trips t
            LEFT JOIN schools s ON t.school_id = s.id
            LEFT JOIN trip_children tc ON t.id = tc.trip_id
            WHERE t.driver_id = $1
              AND DATE(t.departure_time) = CURRENT_DATE
            GROUP BY t.id, s.name
            ORDER BY t.departure_time ASC
            `,
            [driverId]
        );

        //  Prochaines réservations reçues (nouvelles dans les dernières 24h)
        const recentBookings = await query(
            `
            SELECT 
                t.id as trip_id,
                t.departure_time,
                c.name as child_name,
                u.name as parent_name,
                u.phone as parent_phone,
                tc.created_at as booking_time
            FROM trip_children tc
            INNER JOIN trips t ON tc.trip_id = t.id
            INNER JOIN children c ON tc.child_id = c.id
            INNER JOIN users u ON c.parent_id = u.id
            WHERE t.driver_id = $1
              AND tc.created_at >= NOW() - INTERVAL '24 hours'
            ORDER BY tc.created_at DESC
            LIMIT 5
            `,
            [driverId]
        );

        //   Abonnement actif du chauffeur
        const subscription = await query(
            `
            SELECT 
                id,
                type,
                price,
                start_date,
                end_date,
                active,
                CASE 
                    WHEN end_date < CURRENT_DATE THEN 'expired'
                    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'
                    ELSE 'active'
                END as subscription_status
            FROM subscriptions
            WHERE user_id = $1 
              AND active = true
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [user.id]
        );

        //  Retourner toutes les données
        return NextResponse.json({
            success: true,
            data: {
                // Informations du chauffeur
                driver: {
                    id: driverId,
                    user_id: user.id,
                    name: user.name,
                    status: driver.status
                },

                // Trajets à venir avec coordonnées parents
                upcomingTrips: upcomingTrips.rows,

                // Trajets du jour
                todayTrips: todayTrips.rows,

                // Statistiques complètes
                stats: {
                    ...stats.rows[0],
                    average_rating: parseFloat(stats.rows[0].average_rating).toFixed(2)
                },

                // Notifications
                notifications: notifications.rows,
                unreadNotificationsCount: parseInt(unreadNotifications.rows[0].unread_count),

                // Réservations récentes (dernières 24h)
                recentBookings: recentBookings.rows,

                // Abonnement
                subscription: subscription.rows[0] || null,

                // Timestamp de la requête
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Erreur dashboard chauffeur:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Erreur serveur lors de la récupération du dashboard',
            },
            { status: 500 }
        );
    }
}