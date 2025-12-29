/**
 * @swagger
 * /api/schools/{id}:
 *   get:
 *     summary: Récupérer une école par son ID
 *     tags: [ADMIN]

 *
 *   put:
 *     summary: Mettre à jour une école (inclus logo et horaires)
 *     tags: [ADMIN]

 *
 *   patch:
 *     summary: Mettre à jour le statut d'une école
 *     tags: [ADMIN]

 *   delete:
 *     summary: Supprimer une école
 *     tags: [ADMIN]

 */


import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Configure runtime for file uploads
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dossier pour les uploads de logos d'écoles
const uploadDir = path.join(process.cwd(), '/uploads/schools');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

export async function GET(
    req: Request,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const params = 'then' in context.params 
        ? await context.params 
        : context.params;
    const id = Number(params.id);
    const res = await query('SELECT * FROM schools WHERE id=$1', [id]);
    if (res.rowCount === 0) {
        const errorResponse = NextResponse.json({ error: 'Not found' }, { status: 404 });
        errorResponse.headers.set('Access-Control-Allow-Origin', '*');
        return errorResponse;
    }
    const response = NextResponse.json(res.rows[0]);
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
}

export async function PUT(
    req: Request,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    try {
        const params = 'then' in context.params 
            ? await context.params 
            : context.params;
        const id = Number(params.id);
        const formData = await req.formData();
        const name = formData.get('name') as string;
        const address = formData.get('address') as string;
        const opening_time = (formData.get('opening_time') as string) || '08:00';
        const closing_time = (formData.get('closing_time') as string) || '18:00';
        const scheduleJson = formData.get('schedule') as string;
        const logoFile = formData.get('logo') as File | null;

        console.log('Received update data:', { id, name, address, opening_time, closing_time, hasLogo: !!logoFile, hasSchedule: !!scheduleJson });

        let schedule = null;
        if (scheduleJson) {
            try {
                schedule = JSON.parse(scheduleJson);
            } catch (e) {
                console.error('Error parsing schedule JSON:', e);
            }
        }

        // Validation
        if (!name || !address) {
            console.error('Validation failed: missing name or address');
            const errorResponse = NextResponse.json(
                { error: 'Le nom et l\'adresse sont requis' },
                { status: 400 }
            );
            errorResponse.headers.set('Access-Control-Allow-Origin', '*');
            return errorResponse;
        }

        // Gérer l'upload du logo si un nouveau fichier est fourni
        let logo_url: string | null = null;
        if (logoFile && logoFile.size > 0) {
            // Générer un nom unique pour le fichier
            const ext = path.extname(logoFile.name || '');
            const filename = `school_${id}_${Date.now()}${ext}`;
            const newPath = path.join(uploadDir, filename);

            const bytes = await logoFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            fs.writeFileSync(newPath, buffer);
            
            // Stocker le chemin relatif pour l'API
            logo_url = `/uploads/schools/${filename}`;
        }


        const baseUpdates = ['name=$1', 'address=$2', 'opening_time=$3', 'closing_time=$4'];
        const baseParams = [name, address, opening_time, closing_time];
        let paramIndex = 5;
        
        if (logo_url) {
            baseUpdates.push(`logo_url=$${paramIndex}`);
            baseParams.push(logo_url);
            paramIndex++;
        }
        

        let updates = [...baseUpdates];
        let queryParams = [...baseParams];
        let hasSchedule = false;
        
        if (schedule && Array.isArray(schedule)) {
            updates.push(`schedule=$${paramIndex}`);
            queryParams.push(JSON.stringify(schedule));
            hasSchedule = true;
            paramIndex++;
        }
        
        queryParams.push(id); // id is always last
        let queryText = `UPDATE schools SET ${updates.join(', ')} WHERE id=$${paramIndex} RETURNING *`;

        let res;
        try {
            res = await query(queryText, queryParams);
        } catch (dbError: any) {
            // si la colonne nexiste pas lessayer encore
            if (dbError.message && dbError.message.includes('column "schedule"') && hasSchedule) {
                console.warn('la colonne nexiste pas , modifier sans ');

                queryParams = [...baseParams];
                if (logo_url) {
                    queryParams.push(logo_url);
                }
                queryParams.push(id);
                queryText = `UPDATE schools SET ${baseUpdates.join(', ')} WHERE id=$${queryParams.length} RETURNING *`;
                res = await query(queryText, queryParams);
            } else {
                throw dbError;
            }
        }
        
        const response = NextResponse.json(res.rows[0]);
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
    } catch (error: any) {
        console.error('Erreur lors de la mise à jour de l\'école:', error);
        console.error('Stack trace:', error.stack);
        const errorResponse = NextResponse.json(
            { error: error.message || 'Erreur lors de la mise à jour de l\'école' },
            { status: 500 }
        );
        errorResponse.headers.set('Access-Control-Allow-Origin', '*');
        return errorResponse;
    }
}

export async function PATCH(
    req: Request,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    try {
        const params = 'then' in context.params 
            ? await context.params 
            : context.params;
        const id = Number(params.id);
        
        const body = await req.json();
        const { status } = body;

        if (!status || (status !== 'Actif' && status !== 'Inactif')) {
            const errorResponse = NextResponse.json(
                { error: 'Le statut doit être "Actif" ou "Inactif"' },
                { status: 400 }
            );
            errorResponse.headers.set('Access-Control-Allow-Origin', '*');
            return errorResponse;
        }

          const res = await query(
            'UPDATE schools SET status=$1 WHERE id=$2 RETURNING *',
            [status, id]
        );

        if (res.rowCount === 0) {
            const errorResponse = NextResponse.json({ error: 'Not found' }, { status: 404 });
            errorResponse.headers.set('Access-Control-Allow-Origin', '*');
            return errorResponse;
        }

        const response = NextResponse.json(res.rows[0]);
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
    } catch (error: any) {
        console.error('Erreur lors de la mise à jour du statut:', error);
         if (error.message && error.message.includes('column "status"')) {
            console.warn('La colonne status n\'existe pas encore dans la table schools');
            const routeParams = 'then' in context.params 
                ? await context.params 
                : context.params;
            const warningResponse = NextResponse.json({ 
                message: 'La colonne status n\'existe pas encore. Mise à jour ignorée.',
                id: Number(routeParams.id)
            });
            warningResponse.headers.set('Access-Control-Allow-Origin', '*');
            return warningResponse;
        }
        const errorResponse = NextResponse.json(
            { error: error.message || 'Erreur lors de la mise à jour du statut' },
            { status: 500 }
        );
        errorResponse.headers.set('Access-Control-Allow-Origin', '*');
        return errorResponse;
    }
}

export async function DELETE(
    req: Request,
    context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
    const params = 'then' in context.params 
        ? await context.params 
        : context.params;
    const id = Number(params.id);
    await query('DELETE FROM schools WHERE id=$1', [id]);
    const response = NextResponse.json({ success: true });
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
}
