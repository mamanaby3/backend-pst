/**
 * @swagger
 * /api/drivers:
 *   get:
 *     summary: Récupérer tous les chauffeurs
 *     tags: [ADMIN]

 *
 *   post:
 *     summary: Créer un nouveau chauffeur
 *     tags: [ADMIN]

 */
import { NextResponse } from "next/server";
import { getAllDrivers, createDriver } from "@/services/driverServices";

export async function GET() {
    try {
        const drivers = await getAllDrivers();
        return NextResponse.json(drivers);
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const data = await req.json();
        const driver = await createDriver(data);
        return NextResponse.json(driver, { status: 201 });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
