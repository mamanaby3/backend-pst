/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Récupérer tous les utilisateurs (admin uniquement)
 *     tags: [ADMIN]

 *   post:
 *     summary: Créer un utilisateur
 *     tags: [ADMIN]

 */
import { NextResponse } from "next/server";
import { createUser, getAllUsers } from "@/services/userServices";
import { authMiddleware } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const user = authMiddleware(req);
        if (user.role !== "admin") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const res = await getAllUsers();
        return NextResponse.json(res);
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        authMiddleware(req);

        const body = await req.json();
        const user = await createUser(body);

        return NextResponse.json(user);
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
