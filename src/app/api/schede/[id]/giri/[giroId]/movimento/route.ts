import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getGiroById, segnaMovimentoGiro } from "@/lib/giriRepository";
import { getSessionFromRequest, getOperatoreMatricolaFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Segna uscita/rientro del giro dalla pagina di scansione QR (/q/<codice>). Il tablet è già
// loggato; in più serve il token operatore emesso dal PIN, così l'azione è attribuita a chi l'ha
// fatta (come per le ore) e non basta un tablet lasciato aperto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; giroId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const matricola = await getOperatoreMatricolaFromRequest(req);
  if (!matricola) return NextResponse.json({ error: "Operatore non identificato: inserisci di nuovo il PIN" }, { status: 401 });

  const { id, giroId } = await params;
  let azione: unknown;
  try {
    ({ azione } = await req.json());
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (azione !== "uscita" && azione !== "rientro") {
    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  }
  try {
    const giro = await getGiroById(giroId).catch(() => null);
    if (!giro || giro.schedaId !== id) return NextResponse.json({ error: "Giro non trovato" }, { status: 404 });
    const aggiornato = await segnaMovimentoGiro(giroId, azione);
    revalidatePath("/schede");
    void logOperation(`${session.name} (matricola ${matricola})`, "UPDATE", "scheda_giro", giroId, { azione: `qr_${azione}` });
    return NextResponse.json(aggiornato);
  } catch (e) {
    console.error("[POST giro movimento]", e);
    return NextResponse.json({ error: "Errore aggiornamento giro" }, { status: 500 });
  }
}
