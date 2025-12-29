import { NextResponse } from "next/server";
import { getUserByEmail } from "@/services/userServices";
import bcrypt from "bcrypt";
import { signToken } from "@/lib/auth";


/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Connexion d’un utilisateur
 *     description: Permet à un utilisateur de se connecter et de recevoir un token JWT.
 *     tags: [Auth]

 */


export async function POST(req: Request) {
    const { email, password } = await req.json();
    const user = await getUserByEmail(email);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (user.status && user.status !== "active") {
        return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

    const token = signToken({ id: user.id, role: user.role });
    return NextResponse.json({ token, user });
}
