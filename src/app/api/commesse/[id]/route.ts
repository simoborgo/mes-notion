import { NextRequest, NextResponse } from "next/server";
import { getCarichiByCommessa } from "@/lib/carichiRepository";
import { getSchedeByCommessa } from "@/lib/schedeRepository";
import { getCommessaById, updateCommessa } from "@/lib/commesseRepository";
import { getAreeByCommessa } from "@/lib/areeRepository";
import { getSessionFromRequest, COMMESSE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [commessa, aree, schede, carichi] = await Promise.all([
      getCommessaById(id),
      getAreeByCommessa(id),
      getSchedeByCommessa(id),
      getCarichiByCommessa(id),
    ]);
    return NextResponse.json({ commessa, aree, schede, carichi });
  } catch (e) {
    console.error("API commesse/[id] error:", e);
    return NextResponse.json({ error: "Non trovato", detail: String(e) }, { status: 404 });
  }
}

const CAMPI_TRACCIATI = [
  "numeroCommessa", "cliente", "localita", "info", "responsabile", "stato", "dataCarico",
  "inizioMontaggio", "fineMontaggio", "inizioProduzione", "fineProduzione",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.inizioProduzione && body.fineProduzione && body.fineProduzione < body.inizioProduzione) {
    return NextResponse.json({ error: "La fine produzione non può precedere l'inizio produzione" }, { status: 400 });
  }

  try {
    const prima = await getCommessaById(id);
    const commessa = await updateCommessa(id, {
      numeroCommessa: typeof body.numeroCommessa === "string" ? body.numeroCommessa.trim() : undefined,
      cliente: typeof body.cliente === "string" ? body.cliente.trim() : undefined,
      localita: typeof body.localita === "string" ? body.localita.trim() : undefined,
      info: typeof body.info === "string" ? body.info.trim() : undefined,
      responsabile: typeof body.responsabile === "string" ? body.responsabile.trim() : undefined,
      stato: typeof body.stato === "string" ? body.stato : undefined,
      dataCarico: body.dataCarico !== undefined ? (body.dataCarico || null) : undefined,
      inizioMontaggio: body.inizioMontaggio !== undefined ? (body.inizioMontaggio || null) : undefined,
      fineMontaggio: body.fineMontaggio !== undefined ? (body.fineMontaggio || null) : undefined,
      inizioProduzione: body.inizioProduzione !== undefined ? (body.inizioProduzione || null) : undefined,
      fineProduzione: body.fineProduzione !== undefined ? (body.fineProduzione || null) : undefined,
    });
    // Solo i campi davvero cambiati, con valore prima/dopo: il form manda sempre tutti i campi,
    // e lo Storico della commessa mostra queste differenze.
    const campi: Record<string, { da: unknown; a: unknown }> = {};
    for (const k of CAMPI_TRACCIATI) {
      if (body[k] === undefined) continue;
      const da = prima[k] ?? null;
      const a = commessa[k] ?? null;
      if (da !== a) campi[k] = { da, a };
    }
    if (Object.keys(campi).length > 0) void logOperation(session.name, "UPDATE", "commessa", id, { campi });
    return NextResponse.json(commessa);
  } catch (e) {
    console.error("[commesse/[id] PATCH]", e);
    return NextResponse.json({ error: "Errore aggiornamento commessa" }, { status: 500 });
  }
}
