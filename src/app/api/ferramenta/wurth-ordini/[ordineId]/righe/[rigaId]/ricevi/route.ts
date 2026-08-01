import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoloFerramentaById, updateArticoloFerramentaGiacenza } from "@/lib/articoliFerramentaRepository";
import { registraMovimento } from "@/lib/ferramentaRepository";
import { getOrdineConRighe, registraRicezioneRiga } from "@/lib/wurthOrdiniRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ ordineId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { ordineId, rigaId } = await params;
  let body: { quantita?: number; codiceAbarreScansionato?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const quantita = Number(body.quantita);
  if (!quantita || quantita <= 0) {
    return NextResponse.json({ error: "Quantità mancante o non valida" }, { status: 400 });
  }

  const ordine = await getOrdineConRighe(ordineId).catch(() => null);
  if (!ordine) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }
  const riga = ordine.righe.find((r) => r.id === rigaId);
  if (!riga) {
    return NextResponse.json({ error: "Riga non trovata in questo ordine" }, { status: 404 });
  }
  if (!riga.articoloId) {
    return NextResponse.json({ error: "Articolo non censito — censirlo prima in Anagrafica" }, { status: 400 });
  }

  const articolo = await getArticoloFerramentaById(riga.articoloId);
  const giacenzaPrecedente = articolo.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente + quantita;

  await updateArticoloFerramentaGiacenza(riga.articoloId, giacenzaRisultante);

  const movimento = await registraMovimento({
    articoloId: riga.articoloId,
    codiceOs1: articolo.codiceOs1 || null,
    tipo: "carico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    fonte: "wurth",
    note: `Ordine Wurth ${ordine.numeroOrdine}`,
  });

  const { riga: rigaAggiornata, statoRicezione } = await registraRicezioneRiga({
    rigaId,
    quantita,
    codiceAbarreScansionato: body.codiceAbarreScansionato?.trim() || null,
    movimentoId: movimento.id,
    operatore: session.name,
  });

  void logOperation(session.name, "UPDATE", "wurth_ordine_riga", rigaId, { quantita, giacenzaRisultante, statoRicezione });

  revalidatePath("/ferramenta/ordini-wurth");
  revalidatePath("/ferramenta");
  revalidatePath("/admin/ferramenta");

  return NextResponse.json({ ok: true, riga: rigaAggiornata, statoRicezione });
}
