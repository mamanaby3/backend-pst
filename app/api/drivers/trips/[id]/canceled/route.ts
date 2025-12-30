
/**
 * @swagger
 * /api/drivers/trips/{id}/canceled:
 *   put:
 *     summary: Rejeter un trajet
 *     tags: [CHAUFFEUR]
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Récupérer l'utilisateur connecté
        const user = await getUserFromRequest(request);
        console.log("User connecté:", user);

        if (!user || user.role !== 'driver') {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        // Récupérer le driver et vérifier le statut
        const driverResult = await query(
            `SELECT id, status FROM drivers WHERE user_id = $1`,
            [user.id]
        );

        console.log("Driver récupéré:", driverResult.rows[0]);

        if (driverResult.rowCount === 0) {
            return NextResponse.json({ error: 'Chauffeur introuvable' }, { status: 404 });
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

        //  Unwrap la Promise params
        const { id: tripId } = await params;
        console.log("tripId reçu:", tripId, "driverId:", driverId);

        // Mettre à jour le statut du trajet
        const result = await query(
            `UPDATE trips
             SET status = 'canceled'
             WHERE id = $1
               AND driver_id = $2
               AND status IN ('pending', 'in_progress')
             RETURNING *`,
            [tripId, driverId]
        );

        console.log("Résultat UPDATE:", result.rows);

        if (result.rows.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Trajet introuvable ou déjà annule"
                },
                { status: 404 }
            );
        }

        //     Récupérer les parents (utilisez tripId, pas id)
        const parents = await query(
            `SELECT
                 u.id as parent_id,
                 u.name as parent_name,
                 json_agg(
                         json_build_object(
                                 'child_id', c.id,
                                 'child_name', c.name
                         )
                 ) as children
             FROM trip_children tc
                      JOIN children c ON tc.child_id = c.id
                      JOIN users u ON c.parent_id = u.id
             WHERE tc.trip_id = $1
             GROUP BY u.id, u.name`,
            [tripId]
        );


        console.log("Parents à notifier:", parents.rows);

        //     Créer UNE SEULE notification par parent avec TOUS ses enfants
        for (const parent of parents.rows) {
            // parent.children est déjà un tableau
            const childrenNames = parent.children.map((child: any) => child.child_name);

            let description = '';
            if (childrenNames.length === 1) {
                description = `Le trajet de ${childrenNames[0]} est terminé. Merci d\'évaluer le chauffeur.`;
            } else if (childrenNames.length === 2) {
                description = `Le trajet de ${childrenNames[0]} et ${childrenNames[1]} est annulé.`;
            } else {
                const lastChild = childrenNames.pop();
                description = `Le trajet de ${childrenNames.join(', ')} et ${lastChild} est annulé.`;
            }
            // Insérer UNE SEULE notification pour ce parent
            const notif = await query(
                `INSERT INTO notifications (libelle, type, description, emetteur_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [
                    'Trajet annulé',
                    'trip_canceled',
                    description,
                    user.id
                ]
            );

            // Insérer le destinataire
            await query(
                `INSERT INTO notification_destinataires (notification_id, destinataire_id)
                 VALUES ($1, $2)`,
                [notif.rows[0].id, parent.parent_id]
            );
        }

        return NextResponse.json({
            success: true,
            message: "Trajet annulé avec succès",
            data: result.rows[0],
        });

    } catch (error: any) {
        console.error("Erreur fin trajet:", error);
        return NextResponse.json(
            {
                success: false,
                message: error.message,
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            { status: 500 }
        );
    }
}