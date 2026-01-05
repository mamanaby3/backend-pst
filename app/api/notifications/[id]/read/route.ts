import {getUserFromRequest} from "@/lib/auth";
import {NextRequest, NextResponse} from "next/server";
import {query} from "@/lib/db";

type Params = {
    params: Promise<{ id: string }>;
};
export async function PUT_READ(
    request: NextRequest,
    context: Params
) {
    try {
        const user = await getUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const notificationId = await context.params;

        await query(
            `UPDATE notification_destinataires
             SET lu = true, date_lecture = NOW()
             WHERE notification_id = $1
               AND (destinataire_id = $2 OR destinataire_id IS NULL)`,
            [notificationId, user.id]
        );

        return NextResponse.json({
            success: true,
            message: 'Notification marquée comme lue'
        });
    } catch (error) {
        console.error('Erreur marquage notification:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}