import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoloFerramentaById, updateArticoloFerramentaGiacenza } from "@/lib/articoliFerramentaRepository";
import { registraMovimento } from "@/lib/ferramentaRepository";
import { getOrdineConRighe, registraRicezioneRiga, type WurthOrdineRiga, type StatoRicezioneOrdine } from "@/lib/wurthOrdiniRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Carico bulk (Fase: "convalida arrivo ordine Wurth", sessione 2026-08-06): il tracciato CSV
// arriva via n8n al momento dell'ordine, il materiale arriva fisicamente dopo — il magazziniere
// deve poter confermare in un colpo solo tutte le righe effettivamente messe a scaffale, non una
// alla volta. Ogni riga è indipendente: se una fallisce (non censita, quantità non valida, errore
// DB) si salta e si continua con le altre — non deve bloccare il carico dell'intero ordine.
export async function POST(req: NextRequest, { params }: { params: Promise<{ ordineId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { ordineId } = await params;
  let body: { righe?: { rigaId?: string; quantita?: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const richieste = Array.isArray(body.righe) ? body.righe : [];
  if (richieste.length === 0) {
    return NextResponse.json({ error: "Nessuna riga da caricare" }, { status: 400 });
  }

  const ordine = await getOrdineConRighe(ordineId).catch(() => null);
  if (!ordine) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }
  const righePerId = new Map(ordine.righe.map((r) => [r.id, r]));

  const caricati: { rigaId: string; quantita: number }[] = [];
  const saltatiNonCensiti: { rigaId: string; codiceArticolo: string }[] = [];
  const falliti: { rigaId: string; codiceArticolo: string; errore: string }[] = [];
  let ultimoStatoRicezione: StatoRicezioneOrdine = ordine.statoRicezione;
  let ultimaRigaAggiornata: WurthOrdineRiga | null = null;

  for (const richiesta of richieste) {
    const riga = richiesta.rigaId ? righePerId.get(richiesta.rigaId) : undefined;
    const quantita = Number(richiesta.quantita);
    if (!riga) continue;

    if (!riga.articoloId) {
      saltatiNonCensiti.push({ rigaId: riga.id, codiceArticolo: riga.codiceArticolo });
      continue;
    }
    if (!(quantita > 0)) {
      falliti.push({ rigaId: riga.id, codiceArticolo: riga.codiceArticolo, errore: "Quantità non valida" });
      continue;
    }

    try {
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
        note: `Ordine Wurth ${ordine.numeroOrdine} (carico bulk)`,
      });

      const { riga: rigaAggiornata, statoRicezione } = await registraRicezioneRiga({
        rigaId: riga.id,
        quantita,
        codiceAbarreScansionato: null,
        movimentoId: movimento.id,
        operatore: session.name,
      });

      caricati.push({ rigaId: riga.id, quantita });
      ultimoStatoRicezione = statoRicezione;
      ultimaRigaAggiornata = rigaAggiornata;
    } catch (e) {
      falliti.push({ rigaId: riga.id, codiceArticolo: riga.codiceArticolo, errore: e instanceof Error ? e.message : "Errore sconosciuto" });
    }
  }

  // Rileggo l'ordine aggiornato solo se è servito almeno un carico, per restituire lo stato
  // di ricezione finale corretto (calcolato su TUTTE le righe, non solo quelle appena toccate).
  const ordineAggiornato = caricati.length > 0 ? await getOrdineConRighe(ordineId).catch(() => null) : null;

  void logOperation(session.name, "UPDATE", "wurth_ordine", ordineId, {
    azione: "ricevi-tutto", caricati: caricati.length, saltatiNonCensiti: saltatiNonCensiti.length, falliti: falliti.length,
  });

  revalidatePath("/ferramenta/ordini-wurth");
  revalidatePath("/ferramenta");
  revalidatePath("/admin/ferramenta");

  return NextResponse.json({
    ok: true,
    caricati,
    saltatiNonCensiti,
    falliti,
    righe: ordineAggiornato?.righe ?? (ultimaRigaAggiornata ? [ultimaRigaAggiornata] : []),
    statoRicezione: ordineAggiornato?.statoRicezione ?? ultimoStatoRicezione,
  });
}
