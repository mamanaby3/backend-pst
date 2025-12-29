import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, authMiddleware } from "@/lib/auth";
import { deleteUser, getUserById, updateUser } from "@/services/userServices";
import {updateDriverStatus} from "@/services/driverServices";

// Dans app routes Next, params est un Promise : on le tape explicitement
type ParamsPromise = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Récupérer un utilisateur par ID (admin uniquement)
 *     tags: [ADMIN]


 *   put:
 *     summary: Mettre à jour un utilisateur (admin uniquement)
 *     tags: [ADMIN]

 *   delete:
 *     summary: Supprimer un utilisateur (admin uniquement)
 *     tags: [ADMIN]

 */



export async function GET(req: Request, ctx: ParamsPromise) {
    try {
        const user = authMiddleware(req);
        if (user.role !== "admin") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { id } = await ctx.params;
        const numId = Number(id);
        if (Number.isNaN(numId)) {
            return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
        }

        const res = await getUserById(numId);
        return NextResponse.json(res);
    } catch (err) {
        console.error("GET /api/users/[id]] error:", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function PUT(req: Request, ctx: ParamsPromise) {
    try {
        const user = authMiddleware(req);
        if (user.role !== "admin") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { id } = await ctx.params;
        const numId = Number(id);
        if (Number.isNaN(numId)) {
            console.error("PUT /api/users/[id]] invalid id:", id);
            return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
        }

        const body = await req.json();
        console.log("PUT /api/users/[id]] payload:", { id: numId, body });
        const res = await updateUser(numId, body);

        return NextResponse.json(res);
    } catch (err) {
        console.error("PUT /api/users/[id]] error:", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function DELETE(req: Request, ctx: ParamsPromise) {
    try {
        const user = authMiddleware(req);
        if (user.role !== "admin") {
            return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        }

        const { id } = await ctx.params;
        const numId = Number(id);
        if (Number.isNaN(numId)) {
            console.error(
"DELETE /api/users/[id]] invalid id:", id);
            return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
        }

        await deleteUser(numId);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/users/[id]] error:", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
