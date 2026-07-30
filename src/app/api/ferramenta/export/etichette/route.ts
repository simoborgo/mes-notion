import { NextRequest, NextResponse } from "next/server";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { toCsvRow } from "@/lib/csv";
import { getPublicBaseUrl } from "@/lib/url";

const DELIMITER = ";";

// Dati per le etichette identificative (scarico/inventario) da disegnare/stampare in batch
// con Zebra Designer — valide per qualunque articolo attivo, non solo Kanban.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const articoli = (await getArticoliFerramenta()).filter((a) => a.attivo);
    const baseUrl = getPublicBaseUrl(req);

    const header = toCsvRow(
      ["Codice OS1", "Descrizione", "Fornitore", "Unità di Misura", "URL QR Scarico"],
      DELIMITER
    );

    const rows = articoli.map((a) =>
      toCsvRow(
        [a.codiceOs1, a.descrizione, a.fornitoreNome, a.unitaMisura, `${baseUrl}/ferramenta/scarico/${a.id}`],
        DELIMITER
      )
    );

    const body = "﻿" + [header, ...rows].join("\r\n");
    const filename = `ferramenta-etichette-identificative-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[ferramenta/export/etichette]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
