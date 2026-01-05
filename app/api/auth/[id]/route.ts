import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUser } from "@/services/userServices";
import { verifyToken } from "@/lib/auth";

type Params = {
    params: Promise<{ id: string }>;
};

export async function PUT(req: NextRequest, context: Params) {
    try {
        // Simplification : déstructuration directe
        const { id } = await context.params;
        const userId = Number(id);

        // Validation de l'ID
        if (isNaN(userId)) {
            return NextResponse.json(
                { message: "ID utilisateur invalide" },
                { status: 400 }
            );
        }

        // Vérification du token
        const auth = req.headers.get("authorization");
        if (!auth) {
            return NextResponse.json({ message: "No token" }, { status: 401 });
        }

        verifyToken(auth.split(" ")[1]);

        // Récupération des données
        const body = await req.json();
        const { name, email, phone } = body;

        // Vérification de l'existence de l'utilisateur
        const user = await getUserById(userId);
        if (!user) {
            return NextResponse.json(
                { message: "Utilisateur introuvable" },
                { status: 404 }
            );
        }

        // Mise à jour
        const updatedUser = await updateUser(userId, { name, email, phone });

        // Séparation du nom
        const [firstName, ...rest] = (updatedUser.name ?? '').split(' ');

        return NextResponse.json({
            id: updatedUser.id,
            firstName,
            lastName: rest.join(' '),
            email: updatedUser.email,
            phone: updatedUser.phone,
            role: updatedUser.role,
            status: updatedUser.status,
        });

    } catch (err) {
        console.error("API ERROR", err);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}