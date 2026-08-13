import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { getSessionFromRequest } from "@/lib/auth";
import { getNextOdp, createSchedaPage } from "@/lib/schedeRepository";
import { findCommessaByNumber } from "@/lib/commesseRepository";
import { findFornitoreIdByName } from "@/lib/fornitoriRepository";

interface ParsedItem {
  numeroScheda: string;
  commessaNr: string;
  termineDiConsegna: string | null;
  tipologia?: string;
  codiceArticolo?: string | null;
  posizione?: string | null;
  fornitore?: string | null;
  quantita?: number | null;
  stato?: string;
  pageIndex: number;
  gruppo?: number | null;
  otherFields?: Record<string, string>;
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
  };

  const { items, pdfBase64, thumbnailBase64 } = body;
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

  const pdfMatch = pdfBase64.match(/^data:[^;]+;base64,(.+)$/);
  const pdfBuffer = Buffer.from(pdfMatch ? pdfMatch[1] : pdfBase64, "base64");
  const pdfFilename = `scheda-${odp}.pdf`;

  let thumbnailBuffer: Buffer | undefined;
  const thumbMatch = thumbnailBase64?.match(/^data:[^;]+;base64,(.+)$/);
  if (thumbMatch) thumbnailBuffer = Buffer.from(thumbMatch[1], "base64");
  const thumbnailFilename = thumbnailBuffer ? `copertina-${odp}.jpg` : undefined;

  // Resolve fornitore names → Notion relation IDs (in parallel)
  const allFornitoriNames = items.map((it) => it.fornitore ?? null);
  const fornitoreIds = await Promise.all(
    allFornitoriNames.map((name) => (name ? findFornitoreIdByName(name) : Promise.resolve(null))),
  );

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
    pdfBuffer,
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

    const pageIndices = group.map((s) => s.item.pageIndex - 1);
    const groupPdf = await PDFDocument.create();
    const copiedPages = await groupPdf.copyPages(originalPdf, pageIndices);
    copiedPages.forEach((p) => groupPdf.addPage(p));
    const subPdfBuffer = Buffer.from(await groupPdf.save());
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
      dataProduzionePrevista: sub.termineDiConsegna ?? oggi,
      dataSchedaRicevuta: oggi,
      parentId: parentPage.id,
      pdfBuffer: subPdfBuffer,
      pdfFilename: subPdfFilename,
    });
    created.push({ odp, pageId: subPage.id, numeroScheda: subPage.numeroScheda, tipologia: "Sottoscheda" });
    console.log(`[import-scheda] Sottoscheda ${g + 1}/${orderedGroups.length} creata: ${subPage.id} (pagine ${pageIndices.map((p) => p + 1).join(",")}, dataProduzionePrevista=${sub.termineDiConsegna})`);
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
          items: items.map((it) => ({ ...it, otherFields: it.otherFields ?? {} })),
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
  return NextResponse.json({ ok: true, odp, created, n8nError });
}
