import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        // 🔐 Sécurité
        const auth = req.headers.get("authorization");
        if (!auth) {
            return NextResponse.json({ message: "No token" }, { status: 401 });
        }
        verifyToken(auth.split(" ")[1]);

        // 📅 Filtres
        const { searchParams } = new URL(req.url);
        const month = Number(searchParams.get("month"));
        const year = Number(searchParams.get("year"));

        if (!month || !year) {
            return NextResponse.json(
                { message: "month et year requis" },
                { status: 400 }
            );
        }

        // 📊 Récupération des paiements
        const payments = await query(
            `
      SELECT 
        id,
        user_name,
        method,
        amount,
        created_at
      FROM payments
      WHERE EXTRACT(MONTH FROM created_at) = $1
      AND EXTRACT(YEAR FROM created_at) = $2
      ORDER BY created_at DESC
      `,
            [month, year]
        );

        // 💰 Total
        const total = payments.rows.reduce(
            (sum: number, p: any) => sum + Number(p.amount),
            0
        );

        return NextResponse.json({
            period: `${month}/${year}`,
            totalAmount: total,
            totalTransactions: payments.rows.length,
            payments: payments.rows
        });

    } catch (error) {
        console.error("REPORT ERROR", error);
        return NextResponse.json(
            { error: "Erreur génération rapport" },
            { status: 500 }
        );
    }
}
