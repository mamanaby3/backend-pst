/**
 * @swagger
 * /api/trips:
 *   get:
 *     summary: Récupérer tous les trajets
 *     tags: [ADMIN]

 *   post:
 *     summary: Créer un nouveau trajet
 *     tags: [ADMIN]

 */


import { NextResponse } from "next/server";
import { query } from "@/lib/db";


export async function GET() {
    const res = await query(`
        SELECT
            t.id,
            t.start_point,
            t.end_point,
            s.name AS school_name 
            FROM trips t 
            LEFT JOIN schools s ON s.id = t.school_id
        ORDER BY t.created_at DESC
    `);

    return NextResponse.json(res.rows);
}

export async function POST(req: Request) {
    try {
        const {
            driver_id,
            school_id,
            start_point,
            end_point,
            departure_time,
            capacity_max,
            is_recurring
        } = await req.json();

        // 📅 Extraire uniquement la date (YYYY-MM-DD)
        const tripDate = new Date(departure_time).toISOString().split("T")[0];

        // 1️⃣ Vérifier vacances scolaires
        const vacation = await query(
            `
      SELECT 1
      FROM school_vacations
      WHERE school_id = $1
        AND $2::date BETWEEN start_date AND end_date
      LIMIT 1
      `,
            [school_id, tripDate]
        );

        const hasVacation = (vacation.rowCount ?? 0) > 0;

        if (hasVacation) {
            return NextResponse.json(
                { error: "Impossible de créer un trajet pendant les vacances scolaires",
                    type: "HOLIDAY"},
                { status: 400 }
            );
        }

        // 2️⃣ Vérifier jour férié
        const holiday = await query(
            `
                SELECT 1
                FROM public_holidays
                WHERE date = DATE($1)
                    LIMIT 1
            `,
            [tripDate]
        );

        const hasHoliday = (holiday.rowCount ?? 0) > 0;

        if (hasHoliday) {
            return NextResponse.json(
                {
                    error: "Impossible de créer un trajet un jour férié",
                    type: "FERIE"
                },
                { status: 400 }
            );
        }

        // 3️⃣ Création du trip (TON CODE ORIGINAL)
        const res = await query(
            `
      INSERT INTO trips 
        (driver_id, school_id, start_point, end_point, departure_time, capacity_max, is_recurring)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
            [
                driver_id,
                school_id,
                start_point,
                end_point,
                departure_time,
                capacity_max,
                is_recurring || false
            ]
        );

        return NextResponse.json(res.rows[0], { status: 201 });

    } catch (error) {
        console.error("Erreur création trip :", error);
        return NextResponse.json(
            { message: "Erreur lors de la création du trajet" },
            { status: 500 }
        );
    }
}

