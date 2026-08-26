import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { setPreparataRiga } from "@/lib/kitFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Toggle "Preparato" per una riga a testo libero della distinta Kit Ferramenta ODP — vedi
// setPreparataRiga per il motivo (nessuna giacenza da scaricare per queste righe).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schedaId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId, rigaId } = await params;
  let body: { preparata?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (typeof body.preparata !== "boolean") {
    return NextResponse.json({ error: "Campo 'preparata' mancante" }, { status: 400 });
  }

  try {
    const riga = await setPreparataRiga(rigaId, body.preparata, session.name);
    void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { rigaId, azione: body.preparata ? "prepara" : "sprepara" });
    revalidatePath(`/ferramenta/fogli-scarico/${schedaId}`);
    return NextResponse.json(riga);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 400 });
  }
}
