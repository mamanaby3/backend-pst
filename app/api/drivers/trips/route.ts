import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";
/**
 * @swagger
 * /api/drivers/trips:
 *   get:
 *     summary: Récupérer LA Liste des trajets du chauffeur
 *     tags: [CHAUFFEUR]

 *   post:
 *     summary: Créer un nouveau trajet
 *     tags: [CHAUFFEUR]
 */
export async function GET(request: NextRequest) {
    try {
        //   Récupérer le token
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
        }

        const token = authHeader.split(" ")[1];

        //  Décoder le JWT
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
        const driverId = decoded.id;

        //  Récupérer les query params
        const { searchParams } = new URL(request.url);

        const status = searchParams.get("status");
        const date_from = searchParams.get("date_from");
        const date_to = searchParams.get("date_to");
        const page = Number(searchParams.get("page") || 1);
        const limit = Number(searchParams.get("limit") || 20);
        const offset = (page - 1) * limit;

        let whereClause = "WHERE t.driver_id = $1";
        const params: any[] = [driverId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND t.status = $${paramIndex++}`;
            params.push(status);
        }

        if (date_from) {
            whereClause += ` AND t.departure_time >= $${paramIndex++}`;
            params.push(date_from);
        }

        if (date_to) {
            whereClause += ` AND t.departure_time <= $${paramIndex++}`;
            params.push(date_to);
        }

        const trips = await db.query(
            `
      SELECT t.*
      FROM trips t
      ${whereClause}
      ORDER BY t.departure_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
            [...params, limit, offset]
        );

        return NextResponse.json({
            success: true,
            data: trips.rows,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
        }

        const token = authHeader.split(" ")[1];
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
        const driverId = decoded.id;

        const body = await request.json();
        const { start_point, end_point, departure_time, capacity_max, school_id, is_recurring } = body;

        if (!start_point || !end_point || !departure_time || !capacity_max) {
            return NextResponse.json(
                { success: false, message: "Champs obligatoires manquants" },
                { status: 400 }
            );
        }

        const result = await db.query(
            `
                INSERT INTO trips (driver_id, school_id, start_point, end_point, departure_time, capacity_max, is_recurring, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
                    RETURNING *
            `,
            [driverId, school_id, start_point, end_point, departure_time, capacity_max, is_recurring || false]
        );

        return NextResponse.json(
            { success: true, data: result.rows[0] },
            { status: 201 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
