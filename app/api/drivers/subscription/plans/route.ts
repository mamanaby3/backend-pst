
/**
 * @swagger
 * /api/drivers/subscription/plans:
 *   get:
 *     summary: Liste des plans d'abonnement disponibles
 *     tags: [CHAUFFEUR]
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        const plans = await query(
            `
            SELECT 
                id,
                name,
                description,
                price,
                duration_days,
                features,
                ROUND(price / duration_days, 2) as price_per_day
            FROM subscription_plans
            WHERE role = 'driver' AND active = true
            ORDER BY price ASC
            `
        );

        return NextResponse.json({
            success: true,
            data: plans.rows
        });

    } catch (error: any) {
        console.error("Erreur GET plans:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}


/**
 * @swagger
 * /api/drivers/subscription/plans:
 *   get:
 *     summary: Liste des méthodes de paiement sauvegardées
 *     tags: [CHAUFFEUR]
 */

// export async function GET_PAYMENT_METHODS(request: NextRequest) {
//     try {
//         const user = await getUserFromRequest(request);
//
//         if (!user || user.role !== "driver") {
//             return NextResponse.json(
//                 { success: false, message: "Non autorisé" },
//                 { status: 403 }
//             );
//         }
//
//         const methods = await query(
//             `
//             SELECT
//                 id,
//                 method_type,
//                 card_holder_name,
//                 card_last4,
//                 card_brand,
//                 card_exp_month,
//                 card_exp_year,
//                 mobile_number,
//                 mobile_provider,
//                 nickname,
//                 is_default,
//                 is_verified,
//                 created_at,
//                 last_used_at
//             FROM saved_payment_methods
//             WHERE user_id = $1
//             ORDER BY is_default DESC, created_at DESC
//             `,
//             [user.id]
//         );
//
//         return NextResponse.json({
//             success: true,
//             data: methods.rows
//         });
//
//     } catch (error: any) {
//         console.error("Erreur GET payment methods:", error);
//         return NextResponse.json(
//             { success: false, message: error.message },
//             { status: 500 }
//         );
//     }
// }

/**
 * @swagger
 * /api/drivers/subscription/plans:
 *   post:
 *     summary: Ajouter une nouvelle méthode de paiement
 *     tags: [CHAUFFEUR]
 */

export async function POST (request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);

        if (!user || user.role !== "driver") {
            return NextResponse.json(
                { success: false, message: "Non autorisé" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const {
            method_type,
            card_holder_name,
            card_number,
            card_cvv,
            card_exp_month,
            card_exp_year,
            mobile_number,
            mobile_provider,
            is_default = false,
            nickname
        } = body;

        // Validation
        if (!method_type || !['card', 'mobile_money'].includes(method_type)) {
            return NextResponse.json(
                { success: false, message: "Type de méthode invalide" },
                { status: 400 }
            );
        }

        let methodData: any = {
            user_id: user.id,
            method_type,
            is_default
        };

        if (method_type === 'card') {
            if (!card_holder_name || !card_number || !card_cvv || !card_exp_month || !card_exp_year) {
                return NextResponse.json(
                    { success: false, message: "Informations de carte incomplètes" },
                    { status: 400 }
                );
            }

            const card_last4 = card_number.replace(/\s/g, '').slice(-4);
            const card_brand = detectCardBrand(card_number);
            const card_token = `tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            methodData = {
                ...methodData,
                card_holder_name,
                card_last4,
                card_brand,
                card_exp_month,
                card_exp_year,
                card_token,
                nickname: nickname || `${card_brand} ****${card_last4}`
            };

        } else if (method_type === 'mobile_money') {
            if (!mobile_number || !mobile_provider) {
                return NextResponse.json(
                    { success: false, message: "Informations mobile money incomplètes" },
                    { status: 400 }
                );
            }

            methodData = {
                ...methodData,
                mobile_number,
                mobile_provider,
                nickname: nickname || `${mobile_provider} ${mobile_number}`
            };
        }

        const result = await query(
            `
            INSERT INTO saved_payment_methods (
                user_id, method_type, card_holder_name, card_last4,
                card_brand, card_exp_month, card_exp_year, card_token,
                mobile_number, mobile_provider, nickname, is_default
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            `,
            [
                methodData.user_id,
                methodData.method_type,
                methodData.card_holder_name || null,
                methodData.card_last4 || null,
                methodData.card_brand || null,
                methodData.card_exp_month || null,
                methodData.card_exp_year || null,
                methodData.card_token || null,
                methodData.mobile_number || null,
                methodData.mobile_provider || null,
                methodData.nickname,
                methodData.is_default
            ]
        );

        return NextResponse.json(
            {
                success: true,
                message: "Méthode de paiement ajoutée avec succès",
                data: result.rows[0]
            },
            { status: 201 }
        );

    } catch (error: any) {
        console.error("Erreur POST payment method:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}


// ========================================
// FONCTIONS UTILITAIRES
// ========================================

function detectCardBrand(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s/g, '');

    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'American Express';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';

    return 'Unknown';
}