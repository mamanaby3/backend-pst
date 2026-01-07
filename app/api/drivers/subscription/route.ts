// app/api/drivers/subscription/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import axios from "axios";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
    let paymentId: number | null = null;

    try {
        console.log("🚀 DÉBUT - Subscription Request");

        const user = await getUserFromRequest(request);
        if (!user || user.role !== "driver") {
            return NextResponse.json({
                success: false,
                message: "Non autorisé"
            }, { status: 403 });
        }

        console.log("✅ User authentifié:", user.id);

        const body = await request.json();
        const { plan_id, payment_method, mobile_provider, mobile_number } = body;

        console.log("📝 Body reçu:", { plan_id, payment_method, mobile_provider, mobile_number });

        // Validation des données
        if (!plan_id || !payment_method) {
            return NextResponse.json({
                success: false,
                message: "Données manquantes (plan_id, payment_method requis)"
            }, { status: 400 });
        }

        // Vérification des clés PayTech
        if (!process.env.PAYTECH_API_KEY || !process.env.PAYTECH_API_SECRET) {
            console.error("❌ Clés PayTech manquantes");
            return NextResponse.json({
                success: false,
                message: "Configuration PayTech manquante"
            }, { status: 500 });
        }

        // === QUERY 1 : Récupère le plan ===
        console.log("🔍 QUERY 1: SELECT plan with id =", plan_id);
        const planRes = await query(
            `SELECT * FROM subscription_plans WHERE id = $1`,
            [plan_id]
        );
        console.log("✅ QUERY 1: Success, rows =", planRes.rowCount);

        if (planRes.rowCount === 0) {
            return NextResponse.json({
                success: false,
                message: "Plan introuvable"
            }, { status: 404 });
        }
        const plan = planRes.rows[0];

        // Génère un ID de transaction unique
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const transactionId = `PTC${timestamp}${random}`;

        console.log("🆔 Transaction ID:", transactionId);

        // === QUERY 2 : Insère le paiement ===
        console.log("🔍 QUERY 2: INSERT payment");
        console.log("Params:", {
            user_id: user.id,
            amount: plan.price,
            method: payment_method,
            transaction_id: transactionId,
            provider: mobile_provider || null,
            number: mobile_number || null
        });

        try {
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
            paymentId = paymentInsert.rows[0].id;
            console.log("✅ QUERY 2: Payment created, id =", paymentId);
        } catch (err: any) {
            console.error("❌ QUERY 2 FAILED:", err.message);
            throw err;
        }

        // === QUERY 3 : Insère l'abonnement ===
        console.log("🔍 QUERY 3: INSERT subscription");
        console.log("Params:", {
            user_id: user.id,
            plan_id: plan_id,
            type: plan.name,
            price: plan.price,
            duration_days: plan.duration_days,
            payment_id: paymentId
        });

        try {
            await query(
                `INSERT INTO subscriptions (
                    user_id, plan_id, type, price, start_date,
                    end_date, active, payment_id
                ) VALUES (
                             $1, $2, $3, $4, CURRENT_DATE,
                             CURRENT_DATE + INTERVAL '1 day' * $5,
                             false, $6
                         )`,
                [user.id, plan_id, plan.name, plan.price, plan.duration_days, paymentId]
            );
            console.log("✅ QUERY 3: Subscription created");
        } catch (err: any) {
            console.error("❌ QUERY 3 FAILED:", err.message);
            throw err;
        }

        // Détermine l'URL de base
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                'http://localhost:3000');

        console.log("🌐 Base URL:", baseUrl);

        // Prépare le payload pour PayTech
        const paytechPayload = {
            item_name: `Abonnement ${plan.name}`.substring(0, 50),
            item_price: Math.round(Number(plan.price)),
            currency: "XOF",
            ref_command: transactionId,
            command_name: `Sub ${plan.name} - User ${user.id}`.substring(0, 50),
            env: process.env.PAYTECH_ENV || "test",
            ipn_url: `${baseUrl}/api/payments/webhook/paytech`,
            success_url: `${baseUrl}/payment-success?ref=${transactionId}`,
            cancel_url: `${baseUrl}/payment-cancel?ref=${transactionId}`,
        };

        // Ajoute custom_field si mobile money
        if (mobile_number && mobile_provider) {
            Object.assign(paytechPayload, {
                custom_field: JSON.stringify({
                    phone: mobile_number,
                    provider: mobile_provider.toUpperCase(),
                    user_id: user.id
                })
            });
        }

        console.log("📤 Calling PayTech API...");

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
                timeout: 30000
            }
        );

        console.log("✅ PayTech response status:", paytechResponse.status);

        const paytechData = paytechResponse.data;

        // Vérifie si PayTech a retourné une erreur
        if (paytechData.success === 0 || paytechData.success === false) {
            console.error("❌ PayTech refused:", paytechData.message);

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

        // Vérifie la présence de l'URL ou du token
        if (!paytechData.redirect_url && !paytechData.token) {
            console.error("❌ No payment URL received");
            return NextResponse.json({
                success: false,
                message: "Aucune URL de paiement reçue"
            }, { status: 500 });
        }

        // Construit l'URL de paiement finale
        const paymentUrl = paytechData.redirect_url ||
            `https://paytech.sn/payment/checkout/${paytechData.token}`;

        // === QUERY 4 : Sauvegarde le metadata (méthode compatible pooler) ===
        if (paytechData.token) {
            console.log("🔍 QUERY 4: UPDATE metadata");
            console.log("Token:", paytechData.token);
            console.log("Payment URL:", paymentUrl);
            console.log("Payment ID:", paymentId);

            try {
                // Méthode compatible avec pgBouncer Transaction Pooler
                await query(
                    `UPDATE payments
                     SET metadata = '{"paytech_token": "' || $1 || '", "payment_url": "' || $2 || '"}'::jsonb
                     WHERE id = $3`,
                    [paytechData.token, paymentUrl, paymentId]
                );
                console.log("✅ QUERY 4: Metadata saved");
            } catch (err: any) {
                console.error("❌ QUERY 4 FAILED:", err.message);
                console.error("Error code:", err.code);
                console.error("Error detail:", err.detail);
                // Ne pas faire échouer toute la requête si metadata échoue
                console.warn("⚠️ Continuing without metadata...");
            }
        }

        console.log("🎉 SUCCESS - Payment initiated:", transactionId);

        return NextResponse.json({
            success: true,
            payment_url: paymentUrl,
            transaction_id: transactionId,
            message: "Redirection vers PayTech"
        });

    } catch (err: any) {
        console.error("=== ERREUR GLOBALE ===");
        console.error("Message:", err.message);
        console.error("Code:", err.code);
        console.error("Stack:", err.stack);

        if (err.response) {
            console.error("Axios Status:", err.response.status);
            console.error("Axios Data:", err.response.data);
        }

        // Si un paiement a été créé mais qu'il y a eu une erreur après
        if (paymentId) {
            console.log("🔄 Marking payment as failed:", paymentId);
            try {
                await query(
                    `UPDATE payments SET status = 'failed' WHERE id = $1`,
                    [paymentId]
                );
            } catch (updateErr) {
                console.error("Failed to update payment status:", updateErr);
            }
        }

        return NextResponse.json({
            success: false,
            message: err.message || "Erreur serveur",
            error_code: err.code,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: err.response?.status || 500 });
    }
}