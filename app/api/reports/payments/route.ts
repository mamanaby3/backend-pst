/**
 * @swagger
 * /api/reports/payments:
 *   get:
 *     summary: Générer un rapport des paiements
 *     description: |
 *       Cette API génère un rapport des paiements pour un mois et une année spécifiques.
 *       Le rapport peut être exporté en PDF ou en Excel.
 *     tags:
 *       - ADMIN

 */


import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const month = Number(searchParams.get("month"));
        const year = Number(searchParams.get("year"));
        const format = searchParams.get("format") || "pdf";



        if (Number.isNaN(month) || Number.isNaN(year)) {
            return NextResponse.json({ message: "month et year requis" }, { status: 400 });
        }

        // === Récupérer les paiements ===
        const payments = await query(
            `SELECT p.id, u.name AS user_name, p.method, p.amount, p.created_at
             FROM payments p JOIN users u ON u.id = p.user_id
             WHERE EXTRACT(MONTH FROM p.created_at) = $1
               AND EXTRACT(YEAR FROM p.created_at) = $2
             ORDER BY p.created_at DESC`,
            [month, year]
        );

        const revenueMonthlyEnCours = await query(`
            SELECT
                to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
            COALESCE(SUM(amount), 0) AS total
            FROM payments
            WHERE status = 'paid'
              AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
            GROUP BY date_trunc('month', created_at)
        `);

        const pendingPayments = await query(`
            SELECT
                COUNT(*) AS total_pending,
                COALESCE(SUM(amount), 0) AS total_amount
            FROM payments
            WHERE status = 'pending';
        `);
        const activeSubscriptions = await query(`
            SELECT COUNT(*)::int AS total
            FROM subscriptions
            WHERE active = true
              AND start_date <= CURRENT_DATE
              AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        `);

        // === Logos et couleurs ===
        const methodColorsPDF: Record<string, string> = {
            "Yas Money": "#000000",
            "Orange Money": "#000000",
            "Wave": "#000000",
            "Kay Pay": "#000000",
            "Carte Bancaire": "#000000",
            "Espèces": "#000000"
        };

        const methodColorsExcel: Record<string, string> = {
            "Yas Money": "#FFFF99",
            "Orange Money": "#FFA500",
            "Wave": "#00BFFF",
            "Kay Pay": "#00008B",
            "Carte Bancaire": "#000000",
            "Espèces": "#32CD32"
        };

        const methodLogos: Record<string, string> = {
            "Yas Money": path.join(process.cwd(), "public/yasMoney.png"),
            "Orange Money": path.join(process.cwd(), "public/om.png"),
            "Wave": path.join(process.cwd(), "public/wave.png"),
            "Kay Pay": path.join(process.cwd(), "public/kpay.png"),
        };

        // === Récapitulatif par méthode ===
        const recapByMethod: Record<string, { count: number; total: number; logo: string }> =
            payments.rows.reduce((acc, p) => {
                if (!acc[p.method]) {
                    acc[p.method] = {
                        count: 0,
                        total: 0,
                        logo: methodLogos[p.method] || "",
                    };
                }
                acc[p.method].count += 1;
                acc[p.method].total += Number(p.amount);
                return acc;
            }, {} as Record<string, { count: number; total: number; logo: string }>);

        // ================= PDF =================
        if (format === "pdf") {
            const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                const fontPath = path.join(
                    process.cwd(),
                    "public",
                    "fonts",
                    "Roboto-Regular.ttf"
                );

                if (!fs.existsSync(fontPath)) {
                    throw new Error("Police introuvable");
                }

                const doc = new PDFDocument({
                    margin: 30,
                    font: fontPath,
                });

                // Logo de l’entreprise
                const logoPath = path.join(process.cwd(), "public/logo.png");
                if (fs.existsSync(logoPath)) doc.image(logoPath, 40, 30, { width: 70 });

                doc.fontSize(18).text("RAPPORT DES PAIEMENTS", 130, 35);
                const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
                doc.fontSize(11)
                    .text(`Mois : ${MONTHS_FR[month - 1]} ${year}`, 130, 60)
                    .text(`Généré le : ${new Date().toLocaleDateString("fr-FR")}`, 130, 75);

                //   Ligne séparatrice
                doc.moveTo(40, 110).lineTo(550, 110).stroke();
                // Table header
                let y = 130;
                const colX = { client: 40, method: 220, amount: 350, date: 450, logo: 200 };
                doc.fontSize(11)
                    .fillColor("black")
                    .text("Client", colX.client, y, { width: 160 })
                    .text("Méthode", colX.method, y)
                    .text("Montant (CFA)", colX.amount, y)
                    .text("Date", colX.date, y);

                doc.moveTo(40, y + 15).lineTo(550, y + 15).stroke();
                y += 25;

                // Table body
                let total = 0;
                payments.rows.forEach(p => {
                    total += Number(p.amount);
                    const color = methodColorsPDF[p.method] || "black";
                    const logo = methodLogos[p.method];

                    // Logo de la méthode
                    if (logo && fs.existsSync(logo)) doc.image(logo, colX.logo, y - 3, { width: 15, height: 15 });

                    doc.fillColor(color)
                        .fontSize(10)
                        .text(p.user_name, colX.client, y, { width: 160 })
                        .text(p.method, colX.method, y)
                        .text(p.amount.toLocaleString("fr-FR"), colX.amount, y)
                        .text(new Date(p.created_at).toLocaleDateString("fr-FR"), colX.date, y);

                    doc.fillColor("black");
                    y += 20;
                    if (y > 750) { doc.addPage(); y = 50; }
                });

                // Total général
                doc.moveTo(40, y).lineTo(550, y).stroke();
                doc.fontSize(12).text(`TOTAL : ${total.toLocaleString("fr-FR")} CFA`, colX.amount, y + 10);

                // Récapitulatif par méthode
                doc.moveDown(1).fontSize(13).text("Récapitulatif par méthode de paiement");
                doc.moveDown(0.5);
                const recapTop = doc.y;
                const recapX = { method: 40, count: 260, total: 380, logo: 200 };
                doc.fontSize(11)
                    .text("Méthode", recapX.method, recapTop)
                    .text("Nombre", recapX.count, recapTop)
                    .text("Total (CFA)", recapX.total, recapTop);
                doc.moveTo(40, recapTop + 15).lineTo(550, recapTop + 15).stroke();

                let recapY = recapTop + 25;
                let recapTotal = 0;
                let recapCount = 0;
                Object.entries(recapByMethod).forEach(([method, data]) => {
                    const color = methodColorsPDF[method] || "black";
                    const logo = data.logo;

                    if (logo && fs.existsSync(logo)) doc.image(logo, recapX.logo, recapY - 3, { width: 15, height: 15 });

                    doc.fillColor(color)
                        .fontSize(10)
                        .text(method, recapX.method, recapY)
                        .text(data.count.toString(), recapX.count, recapY)
                        .text(data.total.toLocaleString(), recapX.total, recapY);

                    doc.fillColor("black");
                    recapTotal += data.total;
                    recapCount += data.count;
                    recapY += 18;
                });

                doc.moveTo(40, recapY).lineTo(550, recapY).stroke();
                doc.fontSize(11)
                    .text("TOTAL", recapX.method, recapY + 5)
                    .text(recapCount.toString(), recapX.count, recapY + 5)
                    .text(recapTotal.toLocaleString(), recapX.total, recapY + 5);



// --- Abonnements Actifs ---
                doc.moveDown(2)
                    .fontSize(13)
                    .text(`Abonnements Actifs : ${activeSubscriptions.rows[0].total}`,40);

// --- Revenus Mensuels ---
                doc.moveDown(1)
                    .fontSize(13)
                    .text( `Revenus Mensuels: ${revenueMonthlyEnCours.rows[0].total || 0} CFA`, 40)
                    ;

// --- Paiements en Attente ---
                doc.moveDown(1)
                    .fontSize(13)
                    .text(`Paiements en Attente : (${pendingPayments.rows[0].total_amount} CFA)`, 40);

                doc.end();
                doc.on("data", chunk => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", reject);
            });

            return new NextResponse(new Uint8Array(pdfBuffer), {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `inline; filename=rapport_paiements_${month}_${year}.pdf`,
                },
            });
        }

        // ================= EXCEL =================
        else if (format === "excel") {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Paiements");

            sheet.columns = [
                { header: "Client", key: "user_name", width: 30 },
                { header: "Méthode", key: "method", width: 20 },
                { header: "Montant (CFA)", key: "amount", width: 15 },
                { header: "Date", key: "created_at", width: 20 },
            ];

            payments.rows.forEach((p, i) => {
                const row = sheet.addRow({
                    user_name: p.user_name,
                    method: p.method,
                    amount: p.amount,
                    created_at: new Date(p.created_at).toLocaleDateString("fr-FR"),
                });

                const color = methodColorsPDF[p.method] ;
                row.getCell(2).fill = { type:'pattern', pattern:'solid', fgColor:{ argb: color } };
            });

            sheet.addRow([]);
            sheet.addRow(["Récapitulatif par méthode de paiement"]);
            sheet.addRow(["Méthode", "Nombre", "Total (CFA)"]);

            Object.entries(recapByMethod).forEach(([method, data]) => {
                const row = sheet.addRow([method, data.count, data.total]);
                const color = methodColorsPDF[method]  ;
                row.getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb: color } };
            });


            const buffer = await workbook.xlsx.writeBuffer();
            return new NextResponse(new Uint8Array(buffer), {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename=rapport_paiements_${month}_${year}.xlsx`,
                },
            });
        }

        return NextResponse.json({ error: "Format non supporté" }, { status: 400 });

    } catch (err) {
        console.error("REPORT ERROR", err);
        return NextResponse.json({ error: "Erreur génération rapport" }, { status: 500 });
    }

}

