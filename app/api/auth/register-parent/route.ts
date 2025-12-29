/**
 * @swagger
 * /api/auth/register-parent:
 *   post:
 *     summary: Inscription d'un parent
 *     tags: [Auth]

 */

import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const { name, email, phone, password } = await req.json();

        // hash du mot de passe
        const hashedPassword = await hashPassword(password);

        const res = await query(
            `INSERT INTO users (name,email,phone,password,role) VALUES ($1,$2,$3,$4,'parent') RETURNING id,name,email,phone,role`,
            [name, email, phone, hashedPassword]
        );

        return NextResponse.json(res.rows[0]);
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error }, { status: 500 });
    }
}
