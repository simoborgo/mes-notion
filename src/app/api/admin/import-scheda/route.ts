import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { getSessionFromRequest } from "@/lib/auth";
import { getNextOdp, createSchedaPage } from "@/lib/schedeRepository";
import { findCommessaByNumber } from "@/lib/commesseRepository";
import { findFornitoreIdByNomePdf } from "@/lib/fornitoriRepository";
import { generaQrCodice } from "@/lib/schedaQrRepository";
import { timbraQr } from "@/lib/pdfQrStamp";
import type { QrPosizione } from "@/lib/schedaPdfLayoutParser";
import { getPublicBaseUrl } from "@/lib/url";

interface ParsedItem {
  numeroScheda: string;
  commessaNr: string;
  termineDiConsegna: string | null;
  tipologia?: string;
  codiceArticolo?: string | null;
  posizione?: string | null;
  fornitore?: string | null;
  fornitoreId?: string | null; // scelto in anteprima dal menu dell'anagrafica: ha la precedenza sul nome
  quantita?: number | null;
  stato?: string;
  dataRientroPrevista?: string | null;
  pageIndex: number;
  gruppo?: number | null;
  otherFields?: Record<string, string>;
  qr?: QrPosizione | null;
  warnings?: string[];
  source?: string;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const body = (await req.json()) as {
    items: ParsedItem[];
    pdfBase64: string;
    thumbnailBase64?: string;
    // posizione del QR su ogni pagina del PDF originale (null = nessuno spazio), indicizzata per pagina:
    // `items` contiene solo scheda principale e sottoschede incluse, non tutte le pagine
    qrPos?: Array<QrPosizione | null>;
  };

  const { items, pdfBase64, thumbnailBase64, qrPos } = body;
  if (!items?.length || !pdfBase64) {
    return NextResponse.json({ ok: false, error: "Dati mancanti (items o pdfBase64)" }, { status: 400 });
  }

  const commessaNr = items[0].commessaNr?.trim();
  if (!commessaNr) {
    return NextResponse.json({ ok: false, error: "Numero commessa mancante" }, { status: 400 });
  }

  console.log(`[import-scheda] avvio import — ${items.length} item, commessa ${commessaNr}`);

  const commessa = await findCommessaByNumber(commessaNr);
  if (!commessa) {
    return NextResponse.json(
      { ok: false, error: `Commessa ${commessaNr} non trovata in Notion` },
      { status: 422 },
    );
  }
  console.log(`[import-scheda] commessa trovata: ${commessa.id}`);

  const odp = await getNextOdp();
  console.log(`[import-scheda] ODP assegnato: ${odp}`);
  const oggi = new Date().toISOString().slice(0, 10);

  // Niente regex su data URL potenzialmente multi-MB: `.+$` può far esplodere lo stack di V8
  // ("Maximum call stack size exceeded") per il backtracking dell'engine su stringhe lunghe.
  const dataUrlPayload = (dataUrl: string): string | null => {
    const idx = dataUrl.indexOf(";base64,");
    return idx === -1 ? null : dataUrl.slice(idx + ";base64,".length);
  };

  const pdfPayload = dataUrlPayload(pdfBase64);
  const pdfBuffer = Buffer.from(pdfPayload ?? pdfBase64, "base64");
  const pdfFilename = `scheda-${odp}.pdf`;

  let thumbnailBuffer: Buffer | undefined;
  const thumbPayload = thumbnailBase64 ? dataUrlPayload(thumbnailBase64) : null;
  if (thumbPayload) thumbnailBuffer = Buffer.from(thumbPayload, "base64");
  const thumbnailFilename = thumbnailBuffer ? `copertina-${odp}.jpg` : undefined;

  // Fornitore: l'id scelto in anteprima (menu dell'anagrafica) ha la precedenza; senza scelta
  // esplicita si abbina il nome letto dal PDF.
  const fornitoreIds = await Promise.all(
    items.map((it) => {
      if (it.fornitoreId !== undefined) return Promise.resolve(it.fornitoreId);
      return it.fornitore ? findFornitoreIdByNomePdf(it.fornitore) : Promise.resolve(null);
    }),
  );

  // QR della scheda timbrato sul PDF allegato (e su ogni sottoscheda): il codice si genera qui, prima
  // di creare la scheda, perché il QR deve essere già sul PDF che viene caricato su Drive.
  // Un errore nel timbro non blocca l'import: il PDF resta senza QR (l'etichetta si stampa a richiesta).
  const baseUrl = getPublicBaseUrl(req);
  const timbra = async (pdf: Buffer, codice: string, posizioni: Array<QrPosizione | null | undefined>) => {
    try {
      const r = await timbraQr(pdf, `${baseUrl}/q/${codice}`, posizioni);
      return { pdf: Buffer.from(r.bytes), senzaQr: r.paginaSenzaQr };
    } catch (e) {
      console.error("[import-scheda] timbro QR fallito:", e instanceof Error ? e.message : String(e));
      return { pdf, senzaQr: posizioni.map((_, i) => i + 1) };
    }
  };

  const parentCodice = generaQrCodice();
  const parentTimbrato = await timbra(pdfBuffer, parentCodice, qrPos ?? []);
  const qrPagineSenzaQr = parentTimbrato.senzaQr;
  console.log(`[import-scheda] QR timbrato sul PDF principale (${parentCodice})${qrPagineSenzaQr.length ? `, pagine senza QR: ${qrPagineSenzaQr.join(",")}` : ""}`);

  const parent = items[0];
  const parentPage = await createSchedaPage({
    numeroScheda: parent.numeroScheda,
    commessaId: commessa.id,
    odp,
    tipologia: "Scheda",
    stato: parent.stato || "In lavorazione",
    codiceArticolo: parent.codiceArticolo,
    posizione: parent.posizione,
    fornitore: parent.fornitore,
    fornitoreId: fornitoreIds[0],
    quantita: parent.quantita,
    dataProduzionePrevista: parent.termineDiConsegna ?? oggi,
    dataSchedaRicevuta: oggi,
    produzioneEsterna: parent.stato === "In lavorazione Esterna",
    dataRientroPrevista: parent.dataRientroPrevista ?? null,
    qrCodice: parentCodice,
    pdfBuffer: parentTimbrato.pdf,
    pdfFilename,
    thumbnailBuffer,
    thumbnailFilename,
  });
  console.log(`[import-scheda] Scheda principale creata: ${parentPage.id} (dataProduzionePrevista=${parent.termineDiConsegna})`);

  const created = [
    { odp, pageId: parentPage.id, numeroScheda: parentPage.numeroScheda, tipologia: "Scheda" },
  ];

  // Raggruppa le sottoschede selezionate per "gruppo" — pagine con lo stesso numero
  // finiscono in un'unica sottoscheda con PDF unito; senza gruppo, ognuna è a sé.
  const subs = items.slice(1).map((item, i) => ({ item, fornitoreId: fornitoreIds[i + 1] }));
  const groups = new Map<string, typeof subs>();
  for (const sub of subs) {
    const key = sub.item.gruppo != null ? `g-${sub.item.gruppo}` : `single-${sub.item.pageIndex}`;
    const arr = groups.get(key);
    if (arr) arr.push(sub);
    else groups.set(key, [sub]);
  }
  const orderedGroups = Array.from(groups.values()).sort(
    (a, b) => Math.min(...a.map((s) => s.item.pageIndex)) - Math.min(...b.map((s) => s.item.pageIndex)),
  );
  console.log(`[import-scheda] ${orderedGroups.length} sottoscheda/e da creare`);

  const originalPdf = await PDFDocument.load(pdfBuffer);

  for (let g = 0; g < orderedGroups.length; g++) {
    const group = [...orderedGroups[g]].sort((a, b) => a.item.pageIndex - b.item.pageIndex);
    const rappresentante = group[0];
    const sub = rappresentante.item;

    // pageIndex arriva già 0-based dal client (posizione nell'array items, che coincide con
    // l'ordine delle pagine PDF) — NON va decrementato di nuovo, altrimenti ogni sottoscheda
    // finisce con il PDF della pagina precedente alla propria (bug corretto qui il 2026-08-26).
    const pageIndices = group.map((s) => s.item.pageIndex);
    const groupPdf = await PDFDocument.create();
    const copiedPages = await groupPdf.copyPages(originalPdf, pageIndices);
    copiedPages.forEach((p) => groupPdf.addPage(p));
    const subCodice = generaQrCodice();
    const subPdfBuffer = (await timbra(Buffer.from(await groupPdf.save()), subCodice, pageIndices.map((i) => qrPos?.[i] ?? null))).pdf;
    const subPdfFilename = `scheda-${odp}-sub-${g + 1}.pdf`;

    const subStato = sub.stato ?? (
      sub.fornitore && sub.fornitore.toUpperCase() !== "MODAR"
        ? "In lavorazione Esterna"
        : "In lavorazione"
    );
    const subPage = await createSchedaPage({
      numeroScheda: sub.numeroScheda,
      commessaId: commessa.id,
      odp,
      tipologia: "Sottoscheda",
      stato: subStato,
      codiceArticolo: sub.codiceArticolo,
      posizione: sub.posizione,
      fornitore: sub.fornitore,
      fornitoreId: rappresentante.fornitoreId,
      quantita: sub.quantita,
      // La consegna prevista delle sottoschede è quella della scheda principale (letta dal PDF o inserita
      // in anteprima); la data del fornitore è dataRientroPrevista, che segue il PDF.
      dataProduzionePrevista: parent.termineDiConsegna ?? oggi,
      dataSchedaRicevuta: oggi,
      produzioneEsterna: subStato === "In lavorazione Esterna",
      dataRientroPrevista: sub.dataRientroPrevista ?? null,
      parentId: parentPage.id,
      qrCodice: subCodice,
      pdfBuffer: subPdfBuffer,
      pdfFilename: subPdfFilename,
    });
    created.push({ odp, pageId: subPage.id, numeroScheda: subPage.numeroScheda, tipologia: "Sottoscheda" });
    console.log(`[import-scheda] Sottoscheda ${g + 1}/${orderedGroups.length} creata: ${subPage.id} (pagine ${pageIndices.map((p) => p + 1).join(",")}, dataProduzionePrevista=${parent.termineDiConsegna}, dataRientroPrevista=${sub.dataRientroPrevista})`);
  }

  const n8nWebhook = process.env.N8N_WEBHOOK_IMPORT_LLM;
  let n8nError: string | undefined;
  if (n8nWebhook) {
    try {
      await fetch(n8nWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odp,
          commessaNr,
          pageId: parentPage.id,
          operatore: session.name,
          items: items.map((it) => {
            const payload = { ...it, otherFields: it.otherFields ?? {} };
            delete payload.qr; // geometria interna del timbro QR, non interessa a n8n
            return payload;
          }),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      n8nError = (e as Error).message;
      console.warn("[import-scheda] n8n webhook:", n8nError);
    }
  }

  revalidatePath("/schede");

  console.log(`[import-scheda] import completato — ODP ${odp}, ${created.length} pagine create`);
  return NextResponse.json({ ok: true, odp, created, n8nError, qrPagineSenzaQr });
}
