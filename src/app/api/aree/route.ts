import { NextRequest, NextResponse } from "next/server";
import { createArea, getAreeByCommessa } from "@/lib/areeRepository";
import { getSessionFromRequest, COMMESSE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Usato dal select Area nei form Schede (Nuova Scheda / Modifica Scheda): stesso perimetro
// di scrittura di COMMESSE_ROLES/MODIFICA_SCHEDA_ROLES (admin, produzione), oggi identici.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const commessaId = req.nextUrl.searchParams.get("commessaId");
  if (!commessaId) {
    return NextResponse.json({ error: "commessaId obbligatorio" }, { status: 400 });
  }
  try {
    const aree = await getAreeByCommessa(commessaId);
    return NextResponse.json(aree);
  } catch (e) {
    console.error("[aree GET]", e);
    return NextResponse.json({ error: "Errore recupero aree" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const commessaId = typeof body.commessaId === "string" ? body.commessaId : "";
  if (!commessaId) {
    return NextResponse.json({ error: "Commessa obbligatoria" }, { status: 400 });
  }

  try {
    const area = await createArea({
      commessaId,
      nomeArredo: typeof body.nomeArredo === "string" ? body.nomeArredo.trim() : "",
      codiceArticoloA: typeof body.codiceArticoloA === "string" ? body.codiceArticoloA.trim() : "",
      dataConsegnaPrevista: body.dataConsegnaPrevista || null,
      descrizione: typeof body.descrizione === "string" ? body.descrizione.trim() : "",
      note: typeof body.note === "string" ? body.note.trim() : "",
      posizione: typeof body.posizione === "string" ? body.posizione.trim() : "",
      quantita: typeof body.quantita === "number" ? body.quantita : null,
      statoProduzione: typeof body.statoProduzione === "string" ? body.statoProduzione.trim() : "",
    });
    void logOperation(session.name, "CREATE", "area", area.id, body as Record<string, unknown>);
    return NextResponse.json(area);
  } catch (e) {
    console.error("[aree POST]", e);
    return NextResponse.json({ error: "Errore creazione area" }, { status: 500 });
  }
}
