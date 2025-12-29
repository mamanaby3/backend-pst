/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Récupérer la liste des notifications
 *     description: >
 *       Retourne les notifications actives avec pagination, recherche
 *       et statistiques de lecture (destinataires / lus).
 *     tags: [ADMIN]
 *     security:
 *       - bearerAuth: []

 *   post:
 *     summary: Créer une notification
 *     description: >
 *       Crée une notification émise par l'utilisateur connecté.
 *       Elle peut être envoyée à tous les utilisateurs ou à des utilisateurs spécifiques.
 *     tags: [ADMIN]
 *     security:
 *       - bearerAuth: []

 */



import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json(
                { error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { libelle, type, description, imageUrl, destinataireIds, sendToAll } =
            await request.json();

        if (!libelle || !type || !description) {
            return NextResponse.json(
                { error: 'Champs requis manquants' },
                { status: 400 }
            );
        }

        try {
            // DÉBUT Transaction
            await query('BEGIN');

            const insertNotif = await query(
                `INSERT INTO notifications
                     (libelle, type, description, image_url, emetteur_id)
                 VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                [libelle, type, description, imageUrl || null, user.id]
            );

            const notificationId = insertNotif.rows[0].id;

            // Insérer les destinataires
            if (sendToAll === true) {
                // Pour TOUS les utilisateurs - une seule ligne avec destinataire_id NULL
                await query(
                    `INSERT INTO notification_destinataires
                         (notification_id, destinataire_id, lu)
                     VALUES ($1, NULL, false)`,
                    [notificationId]
                );
            } else if (destinataireIds && destinataireIds.length > 0) {
                // Pour des utilisateurs spécifiques- destinataire_id sera charge
                for (const userId of destinataireIds) {
                    await query(
                        `INSERT INTO notification_destinataires
                         (notification_id, destinataire_id, lu)
                         VALUES ($1, $2, false)`,
                        [notificationId, userId]
                    );
                }
            } else {
                // Aucun destinataire sélectionné - erreur
                await query('ROLLBACK');
                return NextResponse.json(
                    { error: 'Veuillez sélectionner au moins un destinataire ou cocher "Envoyer à tous"' },
                    { status: 400 }
                );
            }

            await query('COMMIT');

            return NextResponse.json(
                {
                    success: true,
                    message: 'Notification créée avec succès',
                    notificationId,
                },
                { status: 201 }
            );
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erreur création notification:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}


export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json(
                { error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page') || 1);
        const limit = Number(searchParams.get('limit') || 6);
        const search = searchParams.get('search') || '';
        const offset = (page - 1) * limit;

        const params: any[] = [];
        let whereClause = `WHERE n.statut = 'active'`;

        if (search) {
            params.push(`%${search}%`);
            whereClause += `
                AND (
                    n.libelle ILIKE $${params.length}
                    OR n.description ILIKE $${params.length}
                )
            `;
        }

        const sql = `
            SELECT
                n.id,
                n.libelle,
                n.type,
                n.description,
                n.image_url,
                n.emetteur_id,
                n.date_creation,
                n.statut,
                u.name AS emetteur_nom,
                COUNT(nd.id) AS nb_destinataires,
                COALESCE(SUM(CASE WHEN nd.lu = true THEN 1 ELSE 0 END), 0) AS nb_lus
            FROM notifications n
            LEFT JOIN users u ON u.id = n.emetteur_id
            LEFT JOIN notification_destinataires nd ON nd.notification_id = n.id
            ${whereClause}
            GROUP BY
                n.id,
                n.libelle,
                n.type,
                n.description,
                n.image_url,
                n.emetteur_id,
                n.date_creation,
                n.statut,
                u.name
            ORDER BY n.date_creation DESC
            LIMIT $${params.length + 1}
            OFFSET $${params.length + 2}
        `;

        params.push(limit, offset);

        const result = await query(sql, params);

        // 🔢 total
        let countSql = `
            SELECT COUNT(DISTINCT n.id) AS total
            FROM notifications n
            ${whereClause}
        `;

        const countResult = await query(countSql, params.slice(0, search ? 1 : 0));
        const total = Number(countResult.rows[0].total);

        return NextResponse.json({
            notifications: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Erreur récupération notifications:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
