import { NextRequest, NextResponse } from "next/server";
import { getCommesse } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { toCsvRow, formatDateEnUS } from "@/lib/csv";

// Delimitatore "," (non ";" come gli altri export) — questo file è pensato per la skill
// "modar-programma-riunione", che legge con csv.DictReader in modalità standard Python.
const DELIMITER = ",";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const commesse = await getCommesse();

    const header = toCsvRow(
      ["Numero Commessa", "Cliente", "Località", "Info", "Responsabile", "Stato", "Data Carico", "Carichi", "Inizio Montaggio", "Fine Montaggio", "Giorni Montaggio", "Foto Negozio", "Documenti Allegati"],
      DELIMITER
    );

    // "Data Carico"/"Carichi" restano vuoti qui — la skill li ignora esplicitamente e ricava
    // le date esatte dal file Carichi collegato (join su "Commessa Cliente Info").
    const rows = commesse.map((c) =>
      toCsvRow(
        [
          c.numeroCommessa,
          c.cliente,
          c.localita,
          c.info,
          c.responsabile,
          c.stato,
          "",
          "",
          formatDateEnUS(c.inizioMontaggio),
          formatDateEnUS(c.fineMontaggio),
          c.giorniMontaggio ?? "",
          "",
          "",
        ],
        DELIMITER
      )
    );

    const body = "﻿" + [header, ...rows].join("\r\n");
    const filename = `Commesse_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[commesse/export]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
