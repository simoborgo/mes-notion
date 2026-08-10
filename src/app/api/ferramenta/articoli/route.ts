import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createArticoloFerramenta, getArticoliFerramenta, getCodiciOs1Esistenti } from "@/lib/articoliFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Usata dalla tab "Kit Ferramenta" dentro il dettaglio Scheda per popolare l'autocomplete
// articoli senza scaricare l'intero catalogo (~8000 righe) — filtro sempre lato server.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const metodoGestione = sp.get("metodoGestione");
  const tutti = await getArticoliFerramenta();
  const filtrati = tutti.filter(a => a.attivo && (!metodoGestione || a.metodoGestione === metodoGestione));
  return NextResponse.json(filtrati);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  let body: {
    descrizione?: string;
    codiceOs1?: string;
    unitaMisura?: string;
    fornitoreId?: string | null;
    fornitoreNomeOs1?: string | null;
    codiceFornitore?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const descrizione = body.descrizione?.trim();
  const codiceOs1 = body.codiceOs1?.trim();
  if (!descrizione || !codiceOs1) {
    return NextResponse.json({ error: "Descrizione e Codice OS1 sono obbligatori" }, { status: 400 });
  }

  const esistenti = await getCodiciOs1Esistenti();
  if (esistenti.has(codiceOs1)) {
    return NextResponse.json({ error: `Il codice OS1 "${codiceOs1}" è già in anagrafica` }, { status: 409 });
  }

  try {
    const articolo = await createArticoloFerramenta({
      descrizione,
      codiceOs1,
      unitaMisura: body.unitaMisura?.trim() || "",
      fornitoreId: body.fornitoreId || null,
      fornitoreNomeOs1: body.fornitoreNomeOs1?.trim() || null,
      codiceFornitore: body.codiceFornitore?.trim() || null,
    });

    void logOperation(session.name, "CREATE", "articolo_ferramenta", articolo.id, { descrizione, codiceOs1 });

    revalidatePath("/ferramenta");
    revalidatePath("/admin/ferramenta");

    return NextResponse.json(articolo, { status: 201 });
  } catch (e) {
    // Corsa tra due creazioni concorrenti con lo stesso codice OS1 — il check sopra non basta da solo.
    if ((e as { code?: string }).code === "23505") {
      return NextResponse.json({ error: `Il codice OS1 "${codiceOs1}" è già in anagrafica` }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
