import {NextRequest, NextResponse} from "next/server";
import {getUserById, updateUser} from "@/services/userServices";
import {verifyToken} from "@/lib/auth";

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { params } = context;
        const { id } = await params; // <-- on "unwrap" le Promise

        if (!id || isNaN(Number(id))) {
            return NextResponse.json(
                { message: "ID utilisateur invalide" },
                { status: 400 }
            );
        }

        const userId = Number(id);

        const auth = req.headers.get("authorization");
        if (!auth) {
            return NextResponse.json({ message: "No token" }, { status: 401 });
        }

        verifyToken(auth.split(" ")[1]);

        const body = await req.json();
        const { name, email, phone } = body;

        const user = await getUserById(userId);
        if (!user) {
            return NextResponse.json(
                { message: "Utilisateur introuvable" },
                { status: 404 }
            );
        }

        const updatedUser = await updateUser(userId, { name, email, phone });

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
