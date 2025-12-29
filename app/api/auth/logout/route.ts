import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Déconnexion d'un utilisateur
 *     description: Supprime le token côté client (JWT côté front) pour simuler la déconnexion.
 *     tags: [Auth]
 */


export async function POST(req: Request) {
    const response = NextResponse.json({ message: "Logout successful" });
    response.cookies.set("token", "", { maxAge: 0 }); // supprime le cookie JWT
    return response;
}
