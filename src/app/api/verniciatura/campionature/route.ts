import { NextRequest, NextResponse } from "next/server";
import { getCampionature, createCampionatura } from "@/lib/campionatureVerniciaturaRepository";
import { ensureClienteVerniciaturaEsiste } from "@/lib/clientiVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import type { EsitoCampionatura } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const campionature = await getCampionature({
      soloAttive: sp.get("includeInattive") !== "true",
      cliente: sp.get("cliente") ?? undefined,
      esito: (sp.get("esito") as EsitoCampionatura | null) ?? undefined,
      cicloId: sp.get("cicloId") ?? undefined,
      codicePubblico: sp.get("codicePubblico") ?? undefined,
    });
    return NextResponse.json(campionature);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero campionature" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    if (!body.cicloId) {
      return NextResponse.json({ error: "cicloId obbligatorio" }, { status: 400 });
    }

    // Crea il cliente al volo se non esiste ancora (case-insensitive) PRIMA di aprire la
    // transazione della campionatura, così un typo bloccante fallisce subito.
    let cliente: string;
    try {
      cliente = await ensureClienteVerniciaturaEsiste(String(body.cliente ?? ""));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Cliente non valido" }, { status: 400 });
    }

    const campionatura = await createCampionatura({
      cicloId: body.cicloId,
      cliente,
      codiceCampioneMaterialista: body.codiceCampioneMaterialista ?? null,
      dataCampionatura: body.dataCampionatura ?? null,
      note: body.note ?? null,
      forzaNuovoBarcode: body.forzaNuovoBarcode === true,
    });

    void logOperation(session.name, "CREATE", "campionatura_verniciatura", campionatura.id, { cicloId: body.cicloId, cliente, codicePubblico: campionatura.codicePubblico });
    return NextResponse.json(campionatura, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/campionature]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
