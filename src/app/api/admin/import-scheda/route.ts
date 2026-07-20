import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest } from "@/lib/auth";
import { findCommessaByNumber, getNextOdp, createSchedaPage } from "@/lib/notion";

interface ParsedItem {
  numeroScheda: string;
  commessaNr: string;
  termineDiConsegna: string | null;
  dataOrdine: string | null;
  tipologia?: string;
  codiceArticolo?: string | null;
  posizione?: string | null;
  fornitore?: string | null;
  quantita?: number | null;
  stato?: string;
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

  const commessa = await findCommessaByNumber(commessaNr);
  if (!commessa) {
    return NextResponse.json(
      { ok: false, error: `Commessa ${commessaNr} non trovata in Notion` },
      { status: 422 },
    );
  }

  const odp = await getNextOdp();

  const pdfMatch = pdfBase64.match(/^data:[^;]+;base64,(.+)$/);
  const pdfBuffer = Buffer.from(pdfMatch ? pdfMatch[1] : pdfBase64, "base64");
  const pdfFilename = `scheda-${odp}.pdf`;

  let thumbnailBuffer: Buffer | undefined;
  const thumbMatch = thumbnailBase64?.match(/^data:[^;]+;base64,(.+)$/);
  if (thumbMatch) thumbnailBuffer = Buffer.from(thumbMatch[1], "base64");
  const thumbnailFilename = thumbnailBuffer ? `copertina-${odp}.jpg` : undefined;

  const parent = items[0];
  const parentPage = await createSchedaPage({
    numeroScheda: parent.numeroScheda,
    commessaId: commessa.id,
    odp,
    tipologia: "Scheda",
    stato: parent.stato || "In Lavorazione",
    codiceArticolo: parent.codiceArticolo,
    posizione: parent.posizione,
    fornitore: parent.fornitore,
    quantita: parent.quantita,
    dataProduzionePrevista: parent.termineDiConsegna,
    dataSchedaRicevuta: parent.dataOrdine,
    pdfBuffer,
    pdfFilename,
    thumbnailBuffer,
    thumbnailFilename,
  });

  const created = [
    { odp, pageId: parentPage.id, numeroScheda: parentPage.numeroScheda, tipologia: "Scheda" },
  ];

  for (const sub of items.slice(1)) {
    const subStato = sub.stato ?? (
      sub.fornitore && sub.fornitore.toUpperCase() !== "MODAR"
        ? "In Lavorazione Esterna"
        : "In Lavorazione"
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
      quantita: sub.quantita,
      dataProduzionePrevista: sub.termineDiConsegna,
      dataSchedaRicevuta: sub.dataOrdine,
      parentId: parentPage.id,
    });
    created.push({ odp, pageId: subPage.id, numeroScheda: subPage.numeroScheda, tipologia: "Sottoscheda" });
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

  return NextResponse.json({ ok: true, odp, created, n8nError });
}
