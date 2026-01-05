import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

type Params = {
    params: Promise<{
        id: string;
    }>;
};

// GET: Récupérer un incident par ID
export async function GET(
    req: NextRequest,
    context: Params
) {
    try {
        const { id } = await context.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const sql = 'SELECT * FROM incidents WHERE id = $1';
        const result = await query(sql, [numericId]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('GET incident by ID error:', error);
        return NextResponse.json({ error: 'Failed to fetch incident' }, { status: 500 });
    }
}

// PUT: Mettre à jour un incident
export async function PUT(
    req: NextRequest,
    context: Params
) {
    try {
        const { id } = await context.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const formData = await req.formData();
        const type_de_problem = formData.get('type_de_problem') as string;
        const description = formData.get('description') as string;
        const userIdStr = formData.get('user_id') as string;
        const user_id = parseInt(userIdStr, 10);

        // Validation
        if (!type_de_problem || !description || isNaN(user_id)) {
            return NextResponse.json({
                error: 'Missing or invalid required fields'
            }, { status: 400 });
        }

        // Handle new file uploads
        const documents: any[] = [];
        let index = 0;
        while (formData.has(`documents[${index}]`)) {
            const file = formData.get(`documents[${index}]`) as File;
            if (file) {
                documents.push({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                });
            }
            index++;
        }

        // Update query
        const sql = `
            UPDATE incidents
            SET
                type_de_problem = $1,
                description = $2,
                documents = $3,
                user_id = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
                RETURNING *
        `;

        const result = await query(sql, [
            type_de_problem,
            description,
            documents.length > 0 ? JSON.stringify(documents) : null,
            user_id,
            numericId
        ]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('PUT incident error:', error);
        return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
    }
}

// DELETE: Supprimer un incident
export async function DELETE(
    req: NextRequest,
    context: Params
) {
    try {
        const { id } = await context.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        // Optionnel: Vérifier que l'utilisateur a le droit de supprimer
        const { searchParams } = new URL(req.url);
        const user_id = searchParams.get('user_id');

        if (!user_id) {
            return NextResponse.json({
                error: 'user_id is required'
            }, { status: 400 });
        }

        const sql = 'DELETE FROM incidents WHERE id = $1 RETURNING *';
        const result = await query(sql, [numericId]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
        }

        return NextResponse.json({
            message: 'Incident deleted successfully',
            incident: result.rows[0]
        });
    } catch (error) {
        console.error('DELETE incident error:', error);
        return NextResponse.json({ error: 'Failed to delete incident' }, { status: 500 });
    }
}

// PATCH: Mettre à jour le statut uniquement
export async function PATCH(
    req: NextRequest,
    context: Params
) {
    try {
        const { id } = await context.params;
        const numericId = parseInt(id, 10);

        if (isNaN(numericId)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const body = await req.json();
        const { status } = body;

        if (!status || !['En cours', 'Resolu'].includes(status)) {
            return NextResponse.json({
                error: 'Invalid status. Must be "En cours" or "Resolu"'
            }, { status: 400 });
        }

        const sql = `
            UPDATE incidents
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
                RETURNING *
        `;

        const result = await query(sql, [status, numericId]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('PATCH incident error:', error);
        return NextResponse.json({ error: 'Failed to update incident status' }, { status: 500 });
    }
}