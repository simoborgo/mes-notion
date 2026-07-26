import { NextRequest, NextResponse } from "next/server";
import { getArticoliFerramenta } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { toCsvRow } from "@/lib/csv";

// Delimitatore ";" e BOM UTF-8: Excel in locale italiano si aspetta ";" come separatore CSV
// e non assume UTF-8 di default, altrimenti gli accenti (à/è/ò/ù) escono storpiati.
const DELIMITER = ";";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const articoli = (await getArticoliFerramenta()).filter((a) => a.attivo);

    const header = toCsvRow(
      [
        "Codice OS1",
        "Descrizione",
        "Unità di Misura",
        "Ubicazione",
        "Metodo Gestione",
        "Giacenza Attuale",
        "Codice Fornitore",
        "Quantità Standard Vaschetta",
        "Soglia Minima",
      ],
      DELIMITER
    );

    const rows = articoli.map((a) =>
      toCsvRow(
        [
          a.codiceOs1,
          a.descrizione,
          a.unitaMisura,
          a.ubicazione,
          a.metodoGestione ?? "",
          a.giacenzaAttuale,
          a.codiceFornitore,
          a.quantitaStandardVaschetta ?? "",
          a.sogliaMinima ?? "",
        ],
        DELIMITER
      )
    );

    const body = "﻿" + [header, ...rows].join("\r\n");
    const filename = `ferramenta-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[ferramenta/export]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
