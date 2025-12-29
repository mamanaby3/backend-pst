/**
 * @swagger
 * /api/auth/register-driver:
 *   post:
 *     summary: Inscription d'un chauffeur
 *     tags: [Auth]

 */

import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import formidable, { File } from "formidable";
import fs from "fs";
import path from "path";
import { createDriver } from "@/services/driverServices";


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dossier temporaire pour les telecarement
const uploadDir = path.join(process.cwd(), "/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

export async function POST(req: Request) {
    try {
        const form = formidable({
            uploadDir,
            keepExtensions: true,
        });

        const { fields, files } = await new Promise<any>((resolve, reject) => {
            form.parse(req as any, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });


        const first_name = Array.isArray(fields.first_name) ? fields.first_name[0] : fields.first_name;
        const last_name = Array.isArray(fields.last_name) ? fields.last_name[0] : fields.last_name;
        const email = Array.isArray(fields.email) ? fields.email[0] : fields.email;
        const phone = Array.isArray(fields.phone) ? fields.phone[0] : fields.phone;
        const password = Array.isArray(fields.password) ? fields.password[0] : fields.password;

        const vehicle_brand = Array.isArray(fields.vehicle_brand) ? fields.vehicle_brand[0] : fields.vehicle_brand;
        const vehicle_color = Array.isArray(fields.vehicle_color) ? fields.vehicle_color[0] : fields.vehicle_color;
        const vehicle_plate = Array.isArray(fields.vehicle_plate) ? fields.vehicle_plate[0] : fields.vehicle_plate;

        const hashedPassword = await hashPassword(password);

        //  Création utilisateur
        const userRes = await query(
            `INSERT INTO users (name,email,phone,password,role)
       VALUES ($1,$2,$3,$4,'driver')
       RETURNING id`,
            [`${first_name} ${last_name}`, email, phone, hashedPassword]
        );

        const userId = userRes.rows[0].id;

        const getFilePath = (file?: File | File[]) : string | undefined => {
            if (!file) return undefined;
            return Array.isArray(file) ? file[0].filepath : file.filepath;
        };


        // Récupération chemins fichiers
        const license_document = getFilePath(files.license_document);
        const id_document = getFilePath(files.id_document);
        const vehicle_photo = getFilePath(files.vehicle_photo);

        // Création driver
        const driver = await createDriver({
            user_id: userId,
            vehicle_brand,
            vehicle_color,
            vehicle_plate,
            license_document,
            id_document,
            vehicle_photo,
        });

        return NextResponse.json({
            message: "Inscription réussie",
            userId,
            driver,
        });

    } catch (err: unknown) {
        console.error(err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Erreur serveur" },
            { status: 500 }
        );
    }
}
