import { NextRequest, NextResponse } from "next/server";
import { getVernici } from "@/lib/verniciRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { toCsvRow } from "@/lib/csv";

// Stesso pattern di src/app/api/ferramenta/export/route.ts — delimitatore ";" e BOM UTF-8 per Excel
// in locale italiano.
const DELIMITER = ";";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const vernici = await getVernici({ soloAttivi: true });

    const header = toCsvRow(
      [
        "Codice Inventario",
        "Descrizione Colore",
        "Codice Colore",
        "Tipologia",
        "Bilancio Massa",
        "Unità Misura",
        "Codice Tintometro",
        "Codice Vendita",
        "Finitura",
        "Gloss",
        "Fornitore",
        "Cliente Riferimento",
        "Giacenza Attuale",
      ],
      DELIMITER
    );

    const rows = vernici.map((v) =>
      toCsvRow(
        [
          v.codiceInventario ?? "",
          v.descrizioneColore ?? "",
          v.coloreCodice ?? "",
          v.tipologia,
          v.tipoBilancioMassa ?? "",
          v.unitaMisura ?? "",
          v.codiceTintometro ?? "",
          v.codiceVendita ?? "",
          v.finitura ?? "",
          v.gloss ?? "",
          v.fornitore ?? "",
          v.clienteRiferimento ?? "",
          v.giacenzaAttuale,
        ],
        DELIMITER
      )
    );

    const body = "﻿" + [header, ...rows].join("\r\n");
    const filename = `magazzino-vernici-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[verniciatura/vernici/export]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
