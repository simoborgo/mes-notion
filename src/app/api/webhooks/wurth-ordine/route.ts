import { NextRequest, NextResponse } from "next/server";
import { creaOrdineConRighe, salvaRisultatoElaborazione, segnaErroreElaborazione } from "@/lib/wurthOrdiniRepository";
import { matchArticoloPerCodiceFornitore } from "@/lib/articoliFerramentaRepository";
import { buildOs1Workbook, type RigaOs1 } from "@/lib/wurthOs1Export";

// Soglia di tolleranza sul confronto prezzi (differenze di arrotondamento) — non una vera
// soglia percentuale, "da confermare" per ora (vedi piano Gestione Ordini Wurth).
const TOLLERANZA_PREZZO = 0.005;

interface RigaInput {
  codiceArticolo: string;
  descrizione: string;
  quantita: number;
  prezzoNettoPezzo: number;
}

// Contratto: n8n scarica via FTP il tracciato, lo parsa (Code node) e chiama questa route in
// un'unica richiesta con l'ordine già strutturato — niente insert Postgres lato n8n, ce ne
// occupiamo qui (creaOrdineConRighe è idempotente su numeroOrdine, un retry non duplica nulla).
export async function POST(req: NextRequest) {
  const secret = process.env.WURTH_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let body: {
    numeroOrdine?: string;
    dataOrdine?: string | null;
    dataConsegnaPrevista?: string | null;
    righe?: RigaInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const { numeroOrdine, dataOrdine, dataConsegnaPrevista, righe: righeInput } = body;
  if (!numeroOrdine || !Array.isArray(righeInput) || righeInput.length === 0) {
    return NextResponse.json({ error: "numeroOrdine o righe mancanti" }, { status: 400 });
  }

  let ordine;
  let ordineId: string;
  try {
    ordine = await creaOrdineConRighe({
      numeroOrdine,
      dataOrdine: dataOrdine ?? null,
      dataConsegnaPrevista: dataConsegnaPrevista ?? null,
      righe: righeInput,
    });
    ordineId = ordine.id;
  } catch (e) {
    return NextResponse.json(
      { error: "Errore inserimento ordine", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  try {
    const righeOs1: RigaOs1[] = [];
    const righeConDiscrepanza: {
      codiceArticolo: string; descrizione: string; prezzoTracciato: number; prezzoRiferimento: number | null;
    }[] = [];
    const righeNonCensite: { codiceArticolo: string; descrizione: string; quantita: number; prezzoNettoPezzo: number }[] = [];
    const risultatiRighe: { rigaId: string; articoloId: string | null; discrepanzaPrezzo: boolean }[] = [];

    for (const riga of ordine.righe) {
      const articolo = await matchArticoloPerCodiceFornitore(riga.codiceArticolo);

      if (!articolo) {
        righeNonCensite.push({
          codiceArticolo: riga.codiceArticolo,
          descrizione: riga.descrizione,
          quantita: riga.quantita,
          prezzoNettoPezzo: riga.prezzoNettoPezzo,
        });
        risultatiRighe.push({ rigaId: riga.id, articoloId: null, discrepanzaPrezzo: false });
        continue;
      }

      const discrepanza =
        articolo.prezzoRiferimento == null ||
        Math.abs(articolo.prezzoRiferimento - riga.prezzoNettoPezzo) > TOLLERANZA_PREZZO;

      if (discrepanza) {
        righeConDiscrepanza.push({
          codiceArticolo: riga.codiceArticolo,
          descrizione: riga.descrizione,
          prezzoTracciato: riga.prezzoNettoPezzo,
          prezzoRiferimento: articolo.prezzoRiferimento,
        });
      }

      righeOs1.push({
        codiceOs1: articolo.codiceOs1,
        descrizione: articolo.descrizione,
        unitaMisura: articolo.unitaMisura,
        quantita: riga.quantita,
        prezzoUnitario: riga.prezzoNettoPezzo,
      });
      risultatiRighe.push({ rigaId: riga.id, articoloId: articolo.id, discrepanzaPrezzo: discrepanza });
    }

    await salvaRisultatoElaborazione(ordineId, risultatiRighe);

    const workbook = await buildOs1Workbook(righeOs1);

    return NextResponse.json({
      ok: true,
      numeroOrdine: ordine.numeroOrdine,
      fileOs1Base64: workbook.toString("base64"),
      totaleRighe: ordine.righe.length,
      righeConDiscrepanza,
      righeNonCensite,
    });
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore sconosciuto";
    await segnaErroreElaborazione(ordineId, messaggio).catch(() => {});
    return NextResponse.json({ error: "Errore durante l'elaborazione dell'ordine", detail: messaggio }, { status: 500 });
  }
}
