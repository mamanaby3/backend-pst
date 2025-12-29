/**
 * @swagger
 * /api/schools:
 *   get:
 *     summary: Récupérer toutes les écoles
 *     tags: [ADMIN]

 *
 *   post:
 *     summary: Créer une nouvelle école
 *     tags: [ADMIN]

 */


import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';


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

export async function GET() {
    const res = await query('SELECT * FROM schools ORDER BY name');
    const response = NextResponse.json(res.rows);
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
}

export async function POST(req: Request) {
    try {
        // Convert Next.js Request to FormData
        const formData = await req.formData();
        

        const name = formData.get('name') as string;
        const address = formData.get('address') as string;
        const opening_time = (formData.get('opening_time') as string) || '08:00';
        const closing_time = (formData.get('closing_time') as string) || '18:00';
        const scheduleJson = formData.get('schedule') as string;
        const logoFile = formData.get('logo') as File | null;

        console.log('Received form data:', { name, address, opening_time, closing_time, hasLogo: !!logoFile, hasSchedule: !!scheduleJson });


        let schedule = null;
        if (scheduleJson) {
            try {
                schedule = JSON.parse(scheduleJson);
            } catch (e) {
                console.error('Error parsing schedule JSON:', e);
            }
        }
        

        if (!schedule || !Array.isArray(schedule)) {
            schedule = [
                { day: 'Lundi', open: true, openTime: '08:00', closeTime: '18:00' },
                { day: 'Mardi', open: true, openTime: '08:00', closeTime: '18:00' },
                { day: 'Mercredi', open: true, openTime: '08:00', closeTime: '18:00' },
                { day: 'Jeudi', open: true, openTime: '08:00', closeTime: '18:00' },
                { day: 'Vendredi', open: true, openTime: '08:00', closeTime: '18:00' },
                { day: 'Samedi', open: false, openTime: '00:00', closeTime: '00:00' },
                { day: 'Dimanche', open: false, openTime: '00:00', closeTime: '00:00' }
            ];
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

        // Gérer l'upload du logo
        let logo_url: string | null = null;
        if (logoFile && logoFile.size > 0) {
            // Générer un nom unique pour le fichier
            const ext = path.extname(logoFile.name || '');
            const filename = `school_${Date.now()}${ext}`;
            const newPath = path.join(uploadDir, filename);
            
            // Convert File to Buffer and save
            const bytes = await logoFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            fs.writeFileSync(newPath, buffer);
            
            // Stocker le chemin relatif pour l'API
            logo_url = `/uploads/schools/${filename}`;
        }

          let res;
        try {
            res = await query(
                'INSERT INTO schools (name, address, opening_time, closing_time, logo_url, schedule) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [name, address, opening_time, closing_time, logo_url, JSON.stringify(schedule)]
            );
        } catch (scheduleError: any) {
            if (scheduleError.message && scheduleError.message.includes('column "schedule"')) {
                console.warn('Schedule column does not exist, inserting without schedule');
                res = await query(
                    'INSERT INTO schools (name, address, opening_time, closing_time, logo_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                    [name, address, opening_time, closing_time, logo_url]
                );
            } else {
                throw scheduleError;
            }
        }

        const response = NextResponse.json(res.rows[0], { status: 201 });
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
    } catch (error: any) {
        console.error('Erreur lors de la création de l\'école:', error);
        console.error('Stack trace:', error.stack);
        const errorResponse = NextResponse.json(
            { error: error.message || 'Erreur lors de la création de l\'école' },
            { status: 500 }
        );
        errorResponse.headers.set('Access-Control-Allow-Origin', '*');
        return errorResponse;
    }
}
