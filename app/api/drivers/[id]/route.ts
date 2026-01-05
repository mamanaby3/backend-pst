/**
 * @swagger
 * /api/drivers/{id}:
 *   get:
 *     summary: Récupérer un chauffeur par son ID
 *     tags: [ADMIN]
 *
 *   put:
 *     summary: Mettre à jour un chauffeur
 *     tags: [ADMIN]
 *
 *   delete:
 *     summary: Supprimer un chauffeur
 *     tags: [ADMIN]
 */

import { NextRequest, NextResponse } from "next/server";
import {
    getDriverById,
    updateDriver,
    deleteDriver,
} from "@/services/driverServices";
import { authMiddleware } from "@/lib/auth";

/**
 * GET /api/drivers/{id}
 */
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        authMiddleware(req);

        const { id } = await context.params;

        const driver = await getDriverById(Number(id));
        return NextResponse.json(driver);
    } catch (error) {
        console.error("Erreur GET driver:", error);
        return NextResponse.json(
            { error: "Erreur serveur" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/drivers/{id}
 */
export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        authMiddleware(req);

        const { id } = await context.params;
        const body = await req.json();

        const updated = await updateDriver(Number(id), body);
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Erreur PUT driver:", error);
        return NextResponse.json(
            { error: "Erreur serveur" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/drivers/{id}
 */
export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        authMiddleware(req);

        const { id } = await context.params;

        await deleteDriver(Number(id));
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erreur DELETE driver:", error);
        return NextResponse.json(
            { error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
