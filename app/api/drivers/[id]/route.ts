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

type Params = {
    params: Promise<{
        id: string;
    }>;
};

export async function GET(req: NextRequest, context: Params) {
    authMiddleware(req);

    const { id } = await context.params;
    const driver = await getDriverById(Number(id));

    return NextResponse.json(driver);
}

export async function PUT(req: NextRequest, context: Params) {
    authMiddleware(req);

    const { id } = await context.params;
    const body = await req.json();

    const updated = await updateDriver(Number(id), body);
    return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, context: Params) {
    authMiddleware(req);

    const { id } = await context.params;
    await deleteDriver(Number(id));

    return NextResponse.json({ success: true });
}
