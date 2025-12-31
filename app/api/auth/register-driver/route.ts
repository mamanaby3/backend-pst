/**
 * @swagger
 * /api/auth/register-driver:
 *   post:
 *     summary: Inscription d'un chauffeur
 *     tags: [Auth]

 */

import { NextResponse } from "next/server";
import { File } from "formdata-node";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dossier uploads
const uploadDir = path.join(process.cwd(), "uploads/drivers");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

export async function POST(req: Request) {
    try {
        const formData = await req.formData(); // <-- Next.js 16 App Router
        const getField = (name: string) => formData.get(name)?.toString() || null;
        const getFile = (name: string) => formData.get(name) as File | null;

        const first_name = getField("first_name");
        const last_name = getField("last_name");
        const email = getField("email");
        const phone = getField("phone");
        const password = getField("password");

        const vehicle_brand = getField("vehicle_brand");
        const vehicle_color = getField("vehicle_color");
        const vehicle_plate = getField("vehicle_plate");
        const capacity = getField("capacity") ? parseInt(getField("capacity")!) : null;

        const hashedPassword = await hashPassword(password!);

        // Création utilisateur
        const userRes = await query(
            `INSERT INTO users (name,email,phone,password,role)
       VALUES ($1,$2,$3,$4,'driver') RETURNING id`,
            [`${first_name} ${last_name}`, email, phone, hashedPassword]
        );
        const userId = userRes.rows[0].id;

        // Fonction pour sauvegarder le fichier
        const saveFile = async (file: File | null) => {
            if (!file) return null;
            const filename = `${Date.now()}_${file.name}`;
            const filePath = path.join(uploadDir, filename);
            const buffer = Buffer.from(await file.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            return `/uploads/drivers/${filename}`;
        };

        const license_document = await saveFile(getFile("license_document"));
        const id_document = await saveFile(getFile("id_document"));
        const vehicle_photo = await saveFile(getFile("vehicle_photo"));
        //const poto_profil = await saveFile(getFile("poto_profil"));

        // Création driver
        const driverRes = await query(
            `INSERT INTO drivers (user_id, vehicle_brand, vehicle_color, vehicle_plate, capacity, license_document, id_document, vehicle_photo )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8 ) RETURNING id`,
            [userId, vehicle_brand, vehicle_color, vehicle_plate, capacity, license_document, id_document, vehicle_photo ]
        );

        return NextResponse.json({
            success: true,
            message: "Inscription chauffeur réussie",
            userId,
            driverId: driverRes.rows[0].id
        });

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
