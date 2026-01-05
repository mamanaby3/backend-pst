// app/api/drivers/subscription/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import axios from "axios";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user || user.role !== "driver") {
            return NextResponse.json({
                success: false,
                message: "Non autorisé"
            }, { status: 403 });
        }

        const body = await request.json();
        const { plan_id, payment_method, mobile_provider, mobile_number } = body;

        // Validation des données
        if (!plan_id || !payment_method) {
            return NextResponse.json({
                success: false,
                message: "Données manquantes (plan_id, payment_method requis)"
            }, { status: 400 });
        }

        // Vérification des clés PayTech
        if (!process.env.PAYTECH_API_KEY || !process.env.PAYTECH_API_SECRET) {
            console.error("❌ Clés PayTech manquantes dans les variables d'environnement");
            return NextResponse.json({
                success: false,
                message: "Configuration PayTech manquante"
            }, { status: 500 });
        }

        // Récupère le plan d'abonnement
        const planRes = await query(
            `SELECT * FROM subscription_plans WHERE id = $1`,
            [plan_id]
        );

        if (planRes.rowCount === 0) {
            return NextResponse.json({
                success: false,
                message: "Plan introuvable"
            }, { status: 404 });
        }
        const plan = planRes.rows[0];

        // Génère un ID de transaction unique (sans espaces ni tirets)
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const transactionId = `PTC${timestamp}${random}`;

        // Insère le paiement en statut "pending"
        const paymentInsert = await query(
            `INSERT INTO payments (
                user_id, amount, status, method, payment_type,
                transaction_id, payment_provider, mobile_number
            ) VALUES ($1, $2, 'pending', $3, 'subscription', $4, $5, $6)
                 RETURNING id`,
            [
                user.id,
                plan.price,
                payment_method,
                transactionId,
                mobile_provider || null,
                mobile_number || null
            ]
        );
        const paymentId = paymentInsert.rows[0].id;

        // Insère l'abonnement (inactif en attendant la confirmation)
        await query(
            `INSERT INTO subscriptions (
                user_id, plan_id, type, price, start_date,
                end_date, active, payment_id
            ) VALUES (
                         $1, $2, $3, $4, CURRENT_DATE,
                         CURRENT_DATE + ($5 || ' days')::INTERVAL,
                         false, $6
                     )`,
            [user.id, plan_id, plan.name, plan.price, plan.duration_days, paymentId]
        );

        // Détermine l'URL de base (Vercel ou localhost)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                'http://localhost:3000');

        // Prépare le payload pour PayTech
        const paytechPayload = {
            item_name: `Abonnement ${plan.name}`.substring(0, 50),
            item_price: Math.round(Number(plan.price)), // DOIT être un entier
            currency: "XOF",
            ref_command: transactionId, // Sans espaces ni caractères spéciaux
            command_name: `Sub ${plan.name} - User ${user.id}`.substring(0, 50),
            env: process.env.PAYTECH_ENV || "test", // "test" ou "prod"
            ipn_url: `${baseUrl}/api/payments/webhook/paytech`,
            success_url: `${baseUrl}/payment-success?ref=${transactionId}`,
            cancel_url: `${baseUrl}/payment-cancel?ref=${transactionId}`,
        };

        // Ajoute des informations personnalisées si mobile money
        if (mobile_number && mobile_provider) {
            Object.assign(paytechPayload, {
                custom_field: JSON.stringify({
                    phone: mobile_number,
                    provider: mobile_provider.toUpperCase(),
                    user_id: user.id
                })
            });
        }

        console.log("=== PAYTECH REQUEST ===");
        console.log("URL:", "https://paytech.sn/api/payment/request-payment");
        console.log("Payload:", JSON.stringify(paytechPayload, null, 2));
        console.log("API_KEY:", process.env.PAYTECH_API_KEY ? "✓ Configurée" : "✗ MANQUANTE");
        console.log("API_SECRET:", process.env.PAYTECH_API_SECRET ? "✓ Configurée" : "✗ MANQUANTE");

        // Appel à l'API PayTech
        const paytechResponse = await axios.post(
            "https://paytech.sn/api/payment/request-payment",
            paytechPayload,
            {
                headers: {
                    "Content-Type": "application/json",
                    "API_KEY": process.env.PAYTECH_API_KEY,
                    "API_SECRET": process.env.PAYTECH_API_SECRET
                },
                timeout: 30000 // 30 secondes
            }
        );

        console.log("=== PAYTECH RESPONSE ===");
        console.log("Status:", paytechResponse.status);
        console.log("Data:", JSON.stringify(paytechResponse.data, null, 2));

        const paytechData = paytechResponse.data;

        // Vérifie si PayTech a retourné une erreur
        if (paytechData.success === 0 || paytechData.success === false) {
            console.error("❌ PayTech a refusé la requête:", paytechData);

            // Met à jour le paiement en "failed"
            await query(
                `UPDATE payments SET status = 'failed' WHERE id = $1`,
                [paymentId]
            );

            return NextResponse.json({
                success: false,
                message: paytechData.message || "Erreur lors de l'initiation du paiement",
                error: paytechData
            }, { status: 400 });
        }

        // Vérifie la présence de l'URL de redirection ou du token
        if (!paytechData.redirect_url && !paytechData.token) {
            console.error("  Pas d'URL de paiement reçue de PayTech");
            return NextResponse.json({
                success: false,
                message: "Aucune URL de paiement reçue"
            }, { status: 500 });
        }

        // Construit l'URL de paiement finale
        const paymentUrl = paytechData.redirect_url ||
            `https://paytech.sn/payment/checkout/${paytechData.token}`;

        // Sauvegarde le token PayTech dans les métadonnées
        if (paytechData.token) {
            await query(
                `UPDATE payments
                 SET metadata = jsonb_build_object('paytech_token', $1)
                 WHERE id = $2`,
                [paytechData.token, paymentId]
            );
        }

        console.log("✅ Paiement initié avec succès");
        console.log("URL de paiement:", paymentUrl);

        return NextResponse.json({
            success: true,
            payment_url: paymentUrl,
            transaction_id: transactionId,
            message: "Redirection vers PayTech"
        });

    } catch (err: any) {
        console.error("=== ERREUR POST SUBSCRIPTION ===");
        console.error("Message:", err.message);

        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", JSON.stringify(err.response.data, null, 2));
        }

        if (err.code === 'ECONNABORTED') {
            return NextResponse.json({
                success: false,
                message: "Timeout lors de la connexion à PayTech"
            }, { status: 504 });
        }

        return NextResponse.json({
            success: false,
            message: err.response?.data?.message || err.message || "Erreur serveur",
            error: process.env.NODE_ENV === 'development' ? {
                status: err.response?.status,
                data: err.response?.data,
                message: err.message
            } : undefined
        }, { status: err.response?.status || 500 });
    }
}