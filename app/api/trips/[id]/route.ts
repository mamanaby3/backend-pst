/**
 * @swagger
 * /api/trips/{id}:
 *   get:
 *     summary: Récupérer un trajet par son ID
 *     tags: [ADMIN]
 *   put:
 *     summary: Mettre à jour un trajet
 *     tags: [ADMIN]
 *   patch:
 *     summary: Affecter un chauffeur à un trajet (si non déjà affecté)
 *     tags: [ADMIN]
 *   delete:
 *     summary: Supprimer un trajet
 *     tags: [ADMIN]
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

type Params = {
    params: Promise<{ id: string }>;
};

// GET: Récupérer un trajet par ID
export async function GET(req: NextRequest, context: Params) {
    try {
        const { id } = await context.params;
        const numericId = Number(id);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
        }

        const res = await query('SELECT * FROM trips WHERE id=$1', [numericId]);

        if (res.rowCount === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        return NextResponse.json(res.rows[0]);
    } catch (error) {
        console.error('GET trip error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

// PUT: Mettre à jour un trajet complet
export async function PUT(req: NextRequest, context: Params) {
    try {
        const { id } = await context.params;
        const numericId = Number(id);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
        }

        const body = await req.json();
        const {
            driver_id,
            school_id,
            start_point,
            end_point,
            departure_time,
            capacity_max,
            status,
            is_recurring
        } = body;

        // Validation des champs requis
        if (!school_id || !start_point || !end_point || !departure_time) {
            return NextResponse.json(
                { error: 'Champs requis manquants (school_id, start_point, end_point, departure_time)' },
                { status: 400 }
            );
        }

        const res = await query(
            `UPDATE trips
             SET driver_id=$1, school_id=$2, start_point=$3, end_point=$4,
                 departure_time=$5, capacity_max=$6, status=$7, is_recurring=$8,
                 updated_at=CURRENT_TIMESTAMP
             WHERE id=$9
                 RETURNING *`,
            [
                driver_id || null,
                school_id,
                start_point,
                end_point,
                departure_time,
                capacity_max || 4,
                status || 'En attente',
                is_recurring || false,
                numericId
            ]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        console.error('PUT trip error:', error);
        return NextResponse.json(
            { error: error.message || 'Erreur lors de la mise à jour' },
            { status: 500 }
        );
    }
}

// PATCH: Affecter un chauffeur à un trajet
export async function PATCH(req: NextRequest, context: Params) {
    try {
        const { id } = await context.params;
        const tripId = Number(id);

        if (isNaN(tripId)) {
            return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
        }

        const body = await req.json();
        const { driver_id } = body;

        if (!driver_id) {
            return NextResponse.json(
                { error: 'driver_id requis' },
                { status: 400 }
            );
        }

        // Récupération du trajet
        const tripResult = await query(
            `SELECT start_point, end_point, departure_time, driver_id 
             FROM trips 
             WHERE id = $1`,
            [tripId]
        );

        if (tripResult.rowCount === 0) {
            return NextResponse.json(
                { error: 'Trajet introuvable' },
                { status: 404 }
            );
        }

        const trip = tripResult.rows[0];

        // Optionnel: Vérifier si un chauffeur est déjà affecté
        if (trip.driver_id && trip.driver_id !== driver_id) {
            return NextResponse.json(
                {
                    error: 'Un chauffeur est déjà affecté à ce trajet',
                    current_driver_id: trip.driver_id
                },
                { status: 409 }
            );
        }

        // Vérification des conflits d'horaire pour le chauffeur
        const conflictResult = await query(
            `SELECT id FROM trips
             WHERE driver_id = $1
               AND id != $2
               AND start_point = $3
               AND end_point = $4
               AND departure_time = $5`,
            [driver_id, tripId, trip.start_point, trip.end_point, trip.departure_time]
        );

        if (conflictResult.rowCount && conflictResult.rowCount > 0) {
            return NextResponse.json(
                { error: 'Ce chauffeur a déjà un trajet similaire à cette heure' },
                { status: 409 }
            );
        }

        // Affectation du chauffeur
        const updateResult = await query(
            `UPDATE trips
             SET driver_id = $1, 
                 status = CASE WHEN status = 'En attente' THEN 'Confirmé' ELSE status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [driver_id, tripId]
        );

        return NextResponse.json({
            message: 'Chauffeur affecté avec succès',
            trip: updateResult.rows[0]
        });
    } catch (error: any) {
        console.error('PATCH trip (assign driver) error:', error);
        return NextResponse.json(
            { error: error.message || 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// DELETE: Supprimer un trajet
export async function DELETE(req: NextRequest, context: Params) {
    try {
        const { id } = await context.params;
        const numericId = Number(id);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
        }

        // Vérifier si le trajet existe avant suppression
        const checkResult = await query(
            'SELECT id, status FROM trips WHERE id=$1',
            [numericId]
        );

        if (checkResult.rowCount === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        const trip = checkResult.rows[0];

        // Optionnel: Empêcher la suppression de trajets en cours
        if (trip.status === 'En cours') {
            return NextResponse.json(
                { error: 'Impossible de supprimer un trajet en cours' },
                { status: 400 }
            );
        }

        // Suppression
        await query('DELETE FROM trips WHERE id=$1', [numericId]);

        return NextResponse.json({
            success: true,
            message: 'Trajet supprimé avec succès'
        });
    } catch (error: any) {
        console.error('DELETE trip error:', error);
        return NextResponse.json(
            { error: error.message || 'Erreur lors de la suppression' },
            { status: 500 }
        );
    }
}