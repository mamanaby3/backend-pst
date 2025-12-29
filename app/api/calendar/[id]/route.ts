/**
 * @swagger
 * /api/calendar/id:
*   delete:
*     summary: Supprimer un événement
*     description: Supprime un événement existant selon son type.
*     tags: [ADMIN]


*/
/**
 * DELETE /api/calendar/:id
 * Supprime un événement
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const type = searchParams.get('type');

        if (!id || !type) {
            return NextResponse.json(
                { error: 'Paramètres manquants: id et type requis' },
                { status: 400 }
            );
        }

        if (type === 'HOLIDAY') {
            await query('DELETE FROM school_vacations WHERE id = $1', [id]);
        } else if (type === 'FERIE') {
            await query('DELETE FROM public_holidays WHERE id = $1', [id]);
        } else {
            return NextResponse.json(
                { error: 'Type invalide' },
                { status: 400 }
            );
        }

        return NextResponse.json({ message: 'Événement supprimé avec succès' });
    } catch (error) {
        console.error('Erreur DELETE /api/calendar:', error);
        return NextResponse.json(
            { error: 'Erreur serveur lors de la suppression' },
            { status: 500 }
        );
    }
}