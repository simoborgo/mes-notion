import { NextRequest, NextResponse } from "next/server";
import { getCarichi, getCommesse, getSchede } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { toCsvRow, formatDateEnUS, commessaClienteInfoKey } from "@/lib/csv";

// Delimitatore "," — vedi commento in /api/commesse/export.
const DELIMITER = ",";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const [carichi, commesse, schede] = await Promise.all([getCarichi(), getCommesse(), getSchede()]);

    const commessaKeyById = new Map(commesse.map((c) => [c.id, commessaClienteInfoKey(c)]));
    const odpLabelById = new Map(schede.map((s) => [s.id, s.odp]));

    const header = toCsvRow(
      ["Commessa Cliente Info", "Titolo", "Descrizione", "Data Carico", "Modalità", "Stato", "ODP", "Documenti"],
      DELIMITER
    );

    const rows = carichi.map((c) =>
      toCsvRow(
        [
          c.commessaId ? commessaKeyById.get(c.commessaId) ?? "" : "",
          c.titolo,
          c.descrizione,
          formatDateEnUS(c.dataCarico),
          c.modalita,
          c.stato,
          c.odpIds.map((id) => odpLabelById.get(id)).filter(Boolean).join(", "),
          c.documenti.map((d) => d.name).join(", "),
        ],
        DELIMITER
      )
    );

    const body = "﻿" + [header, ...rows].join("\r\n");
    const filename = `Carichi_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[carichi/export]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
