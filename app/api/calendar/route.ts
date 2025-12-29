/**
 * @swagger
 * /api/calendar:
 *   get:
 *     summary: Récupérer les événements du calendrier
 *     description: >
 *       Retourne les vacances scolaires (si schoolId est fourni)
 *       ou les jours fériés pour un mois et une année donnés.
 *     tags: [ADMIN]

 *
 *   post:
 *     summary: Créer un événement
 *     description: >
 *       Crée un événement de type vacances scolaires (HOLIDAY)
 *       ou jour férié (FERIE).
 *     tags: [ADMIN]

*/


import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/calendar
 * Récupère les événements (vacances + jours fériés) pour un mois donné
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const schoolId = searchParams.get('schoolId');
        const month = parseInt(searchParams.get('month') || '0');
        const year = parseInt(searchParams.get('year') || '0');

        if (!month || !year || month < 1 || month > 12) {
            return NextResponse.json(
                { error: 'Paramètres invalides (month et year requis)' },
                { status: 400 }
            );
        }

        //   PAS D'ÉCOLE → PAS DE VACANCES
        if ( schoolId) {



        const vacationsQuery = `
            SELECT
                id,
                name AS title,
                start_date,
                end_date,
                school_id AS "schoolId",
                'HOLIDAY' AS type
            FROM school_vacations
            WHERE school_id = $1
              AND (
                (start_date <= DATE '${year}-${month}-31'
                    AND end_date >= DATE '${year}-${month}-01')
                )
        `;

        const vacations = await query(vacationsQuery, [schoolId]);
            const events = [
                ...vacations.rows.map(v => ({
                    ...v,
                    type: 'HOLIDAY',
                    schoolId:v.school_id,
                    start_date: v.start_date.toISOString().split('T')[0],
                    end_date: v.end_date.toISOString().split('T')[0]
                }))
            ];
            return NextResponse.json(events);
        }
        // Jours fériés (toujours récupérés, pas de filtre école)
        const holidays = await query(
            `
      SELECT 
        id, 
        label AS title, 
        date AS start_date, 
        date AS end_date
      FROM public_holidays
      WHERE EXTRACT(MONTH FROM date) = $1
        AND EXTRACT(YEAR FROM date) = $2
      `,
            [month, year]
        );

        // Fusion des deux types d'événements
        const events = [

            ...holidays.rows.map(h => ({
                ...h,
                type: 'FERIE',
                schoolId: null,
                start_date: h.start_date.toISOString().split('T')[0],
                end_date: h.end_date.toISOString().split('T')[0]
            }))
        ];

        return NextResponse.json(events);
    } catch (error) {
        console.error('Erreur GET /api/calendar:', error);
        return NextResponse.json(
            { error: 'Erreur serveur lors de la récupération des événements' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/calendar
 * Crée un nouvel événement (vacances ou jour férié)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { schoolId, name, startDate, endDate, type } = body;

        // Validation
        if (!type || !startDate || !name) {
            return NextResponse.json(
                { error: 'Champs obligatoires: type, startDate, name' },
                { status: 400 }
            );
        }

        if (!['HOLIDAY', 'FERIE'].includes(type)) {
            return NextResponse.json(
                { error: 'Type invalide (doit être HOLIDAY ou FERIE)' },
                { status: 400 }
            );
        }

        // Validation spécifique aux vacances
        if (type === 'HOLIDAY') {
            if (!schoolId) {
                return NextResponse.json(
                    { error: 'schoolId requis pour les vacances' },
                    { status: 400 }
                );
            }
            if (!endDate) {
                return NextResponse.json(
                    { error: 'endDate requis pour les vacances' },
                    { status: 400 }
                );
            }

            // Insertion dans school_vacations
            const result = await query(
                `INSERT INTO school_vacations (school_id, name, start_date, end_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
                [schoolId, name, startDate, endDate]
            );

            return NextResponse.json({
                message: 'Vacances créées avec succès',
                id: result.rows[0].id
            });
        }

        // Type FERIE
        const result = await query(
            `INSERT INTO public_holidays (label, date) 
       VALUES ($1, $2)
       RETURNING id`,
            [name, startDate]
        );

        return NextResponse.json({
            message: 'Jour férié créé avec succès',
            id: result.rows[0].id
        });
    } catch (error) {
        console.error('Erreur POST /api/calendar:', error);
        return NextResponse.json(
            { error: 'Erreur serveur lors de la création de l\'événement' },
            { status: 500 }
        );
    }
}
