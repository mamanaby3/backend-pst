/**
 * @swagger
 * /api/drivers/profile:
 *   get:
 *     summary: Récupérer le profil complet du chauffeur
 *     tags: [CHAUFFEUR]
 *     security:
 *       - bearerAuth: []
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import path from "path";
import fs from "fs";


export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
        }

        const result = await query(
            `
                SELECT
                    u.id AS user_id,
                    u.name,
                    u.email,
                    u.phone,
                    u.address,

                    d.id AS driver_id,
                    d.vehicle_brand,
                    d.vehicle_color,
                    d.vehicle_plate,
                    d.capacity,
                    d.photo_profil,
                    d.status AS driver_status

                FROM users u
                         JOIN drivers d ON d.user_id = u.id
                WHERE u.id = $1
            `,
            [user.id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json(
                { error: "Chauffeur introuvable" },
                { status: 404 }
            );
        }

        const profile = result.rows[0];

        //  Séparer prénom / nom depuis "name"
        const nameParts = profile.name?.trim().split(" ") || [];
        const first_name = nameParts.shift() || "";
        const last_name = nameParts.join(" ");

        return NextResponse.json({
            success: true,
            data: {
                personal: {
                    id: profile.user_id,
                    first_name,
                    last_name,
                    full_name: profile.name,
                    email: profile.email,
                    phone: profile.phone,
                    address: profile.address,
                    photo_profil: profile.photo_profil
                        ? profile.photo_profil
                        : null,
                },

                driver: {
                    id: profile.driver_id,
                    status: profile.driver_status,
                    photo_profil: profile.photo_profil
                        ? profile.photo_profil
                        : null,
                },

                vehicle: {
                    brand: profile.vehicle_brand,
                    color: profile.vehicle_color,
                    plate: profile.vehicle_plate,
                    capacity: profile.capacity,
                }
            }
        });

    } catch (error: any) {
        console.error("Erreur récupération profil chauffeur:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

/**
 * @swagger
 * /api/drivers/profile:
 *   put:
 *     summary: Mettre à jour le profil du chauffeur
 *     tags: [CHAUFFEUR]
 *     security:
 *       - bearerAuth: []
 */



export async function PUT(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
        }


        const formData = await request.formData();

        const first_name = formData.get("first_name") as string | null;
        const last_name = formData.get("last_name") as string | null;
        const phone = formData.get("phone") as string | null;
        const address = formData.get("address") as string | null;
        const vehicle_brand = formData.get("vehicle_brand") as string | null;
        const vehicle_color = formData.get("vehicle_color") as string | null;
        const capacity = formData.get("capacity")
            ? Number(formData.get("capacity"))
            : null;

        const photoFile = formData.get("photo_profil") as File | null;

        //  Reconstruire name
        let fullName: string | null = null;
        if (first_name || last_name) {
            fullName = `${first_name || ""} ${last_name || ""}`.trim();
        }

        //   Gérer l’upload de la photo
        let photo_url: string | null = null;

        if (photoFile && photoFile.size > 0) {
            const uploadDir = path.join(process.cwd(), "/uploads/drivers");

            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const ext = path.extname(photoFile.name);
            const filename = `driver_${user.id}_${Date.now()}${ext}`;
            const filePath = path.join(uploadDir, filename);

            const bytes = await photoFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            fs.writeFileSync(filePath, buffer);

            photo_url = `/uploads/drivers/${filename}`;
        }

        await query("BEGIN");

        try {
            //  USERS
            await query(
                `
                UPDATE users
                SET
                    name = COALESCE($1, name),
                    phone = COALESCE($2, phone),
                    address = COALESCE($3, address),
                    updated_at = NOW()
                WHERE id = $4
                `,
                [fullName, phone, address, user.id]
            );

            //   DRIVERS (photo_profil ici )
            await query(
                `
                UPDATE drivers
                SET
                    vehicle_brand = COALESCE($1, vehicle_brand),
                    vehicle_color = COALESCE($2, vehicle_color),
                    capacity = COALESCE($3, capacity),
                    photo_profil = COALESCE($4, photo_profil),
                    updated_at = NOW()
                WHERE user_id = $5
                `,
                [vehicle_brand, vehicle_color, capacity, photo_url, user.id]
            );

            await query("COMMIT");

            return NextResponse.json({
                success: true,
                message: "Profil mis à jour avec succès",
                photo_profil: photo_url
            });

        } catch (err) {
            await query("ROLLBACK");
            throw err;
        }

    } catch (error: any) {
        console.error("Erreur update profil chauffeur:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

