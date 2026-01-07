/**
 * @swagger
 * /api/incidents:
 *   get:
 *     summary: Récupérer la liste des incidents
 *     description: >
 *       Retourne les incidents avec recherche, pagination et tri par date de création.
 *     tags: [ADMIN]

 */
/**
 * @swagger
 * /api/incidents:
 *   post:
 *     summary: Créer un nouvel incident
 *     description: >
 *       Permet de créer un incident avec 1 à 3 documents obligatoires.
 *     tags:
 *       - ADMIN

 */

import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

interface Incident {
    id: number;
    type_de_problem: string;
    description: string;
    status: 'En cours' | 'Resolu';
    documents: any[];
    user_id: number; // Ensure this matches the table
    created_at: string;
    updated_at: string;
    declarant?: string;
}

// GET: Retrieve incidents with search and pagination
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        const offset = (page - 1) * limit;

        // Fixed SQL: Added WHERE for search, LIMIT, and OFFSET
        const sql = `
            SELECT *
            FROM incidents
            WHERE type_de_problem ILIKE $1 OR description ILIKE $1
            ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
        `;
        const values = [`%${search}%`, limit, offset];
        const result = await query(sql, values);

        // Count query remains similar
        const countSql = `
            SELECT COUNT(*) as total
            FROM incidents
            WHERE type_de_problem ILIKE $1 OR description ILIKE $1
        `;
        const countResult = await query(countSql, [`%${search}%`]);
        const total = parseInt(countResult.rows[0].total, 10);

        return NextResponse.json({
            incidents: result.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('GET incidents error:', error);
        return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 });
    }
}


// POST: Create an incident with up to 3 documents
export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        const type_de_problem = formData.get('type_de_problem') as string;
        const description = formData.get('description') as string;
        const user_id = Number(formData.get('user_id'));

        if (!type_de_problem || !description || !user_id) {
            return NextResponse.json(
                { error: 'Champs obligatoires manquants' },
                { status: 400 }
            );
        }

        // 📁 Gestion des documents (1 à 3 max)
        const documents: any[] = [];

        for (let i = 0; i < 3; i++) {
            const file = formData.get(`documents[${i}]`);

            if (file && file instanceof File) {
                documents.push({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    // url: à remplir plus tard (S3, Cloudinary, etc.)
                });
            }
        }

        // ❌ Aucun document
        if (documents.length === 0) {
            return NextResponse.json(
                { error: 'Au moins un document est requis' },
                { status: 400 }
            );
        }

        // ❌ Trop de documents
        if (documents.length > 3) {
            return NextResponse.json(
                { error: 'Maximum 3 documents autorisés' },
                { status: 400 }
            );
        }

        const sql = `
            INSERT INTO incidents (
                type_de_problem,
                description,
                documents,
                user_id,
                status
            )
            VALUES ($1, $2, $3, $4, $5)
                RETURNING *
        `;

        const result = await query(sql, [
            type_de_problem,
            description,
            JSON.stringify(documents),
            user_id,
            'En cours'
        ]);

        return NextResponse.json(result.rows[0], { status: 201 });

    } catch (error) {
        console.error('POST incident error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création de l’incident' },
            { status: 500 }
        );
    }
}
