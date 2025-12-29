/**
 * @swagger
 * /api/trips/{id}:
 *   get:
 *     summary: Récupérer un trajet par son ID
 *     tags: [ADMIN]

 *
 *   put:
 *     summary: Mettre à jour un trajet
 *     tags: [ADMIN]

 *
 *   patch:
 *     summary: Affecter un chauffeur à un trajet (si non déjà affecté)
 *     tags: [ADMIN]

 *
 *   delete:
 *     summary: Supprimer un trajet
 *     tags: [ADMIN]

 */


import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request, params: { id: string }) {
    const id = Number(params.id);
    const res = await query('SELECT * FROM trips WHERE id=$1', [id]);
    if (res.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(res.rows[0]);
}

export async function PUT(req: Request, params: { id: string }) {
    const id = Number(params.id);
    const { driver_id, school_id, start_point, end_point, departure_time, capacity_max, status, is_recurring } = await req.json();

    const res = await query(
        `UPDATE trips 
         SET driver_id=$1, school_id=$2, start_point=$3, end_point=$4, departure_time=$5, capacity_max=$6, status=$7, is_recurring=$8 
         WHERE id=$9 
         RETURNING *`,
        [driver_id, school_id, start_point, end_point, departure_time, capacity_max, status, is_recurring, id]
    );

    return NextResponse.json(res.rows[0]);
}

// Route PATCH pour affecter un chauffeur à un trajet



export async function PATCH(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const tripId = Number(id);

        const body = await req.json();
        const { driver_id } = body;

        if (!tripId || !driver_id) {
            return NextResponse.json(
                { message: "trip_id et driver_id requis" },
                { status: 400 }
            );
        }

        // Récupération du trajet
        const trip = await query(
            `SELECT start_point, end_point, departure_time FROM trips WHERE id = $1`,
            [tripId]
        );

        if (!trip.rows[0]) {
            return NextResponse.json(
                { message: "Trajet introuvable" },
                { status: 404 }
            );
        }

        const { start_point, end_point, departure_time } = trip.rows[0];

        // Vérification qu'un autre trajet du même chauffeur au même horaire n'existe pas
        const conflict = await query(
            `SELECT * FROM trips
             WHERE driver_id = $1
               AND start_point = $2
               AND end_point = $3
               AND departure_time = $4`,
            [driver_id, start_point, end_point, departure_time]
        );

        if (conflict.rows.length > 0) {
            return NextResponse.json(
                { message: "Ce chauffeur a déjà un trajet à cette date et heure" },
                { status: 409 }
            );
        }

        // Affectation du chauffeur (plus besoin de driver_id IS NULL)
        const result = await query(
            `UPDATE trips
             SET driver_id = $1
             WHERE id = $2
                 RETURNING *`,
            [driver_id, tripId]
        );

        return NextResponse.json(result.rows[0]);
    } catch (error: any) {
        console.error("Erreur affectation chauffeur :", error);
        return NextResponse.json(
            { message: "Erreur serveur" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request, params: { id: string }) {
    const id = Number(params.id);
    await query('DELETE FROM trips WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
}
