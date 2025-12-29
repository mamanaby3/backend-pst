/**
 * @swagger
 * /api/drivers/{id}:
 *   get:
 *     summary: Récupérer un chauffeur par son ID
 *     tags: [ADMIN]

 *   put:
 *     summary: Mettre à jour un chauffeur
 *     tags: [ADMIN]

 *
 *   delete:
 *     summary: Supprimer un chauffeur
 *     tags: [ADMIN]

 */

import { NextResponse } from "next/server";
import {getDriverById, updateDriver, deleteDriver, updateDriverStatus} from "@/services/driverServices";
import {authMiddleware} from "@/lib/auth";

export async function GET(req: Request, params: { id: string }) {
    const driver = await getDriverById(Number(params.id));
    return NextResponse.json(driver);
}

export async function PUT(req: Request, params: { id: string }) {
    const body = await req.json();
    const updated = await updateDriver(Number(params.id), body);
    return NextResponse.json(updated);
}

export async function DELETE(req: Request, params: { id: string }) {
    await deleteDriver(Number(params.id));
    return NextResponse.json({ success: true });
}

