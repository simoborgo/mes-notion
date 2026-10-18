import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { parseDocument, type PdfPageData } from "@/lib/schedaPdfLayoutParser";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const body = (await req.json()) as { pageTexts?: string[]; pdfText?: string; pageItems?: PdfPageData[] };
  const pageTexts: string[] = body.pageTexts ?? (body.pdfText ? [body.pdfText] : []);

  if (!pageTexts.length || !pageTexts.some((t) => t.trim())) {
    return NextResponse.json({ ok: false, error: "Testo PDF mancante" }, { status: 400 });
  }

  // 1) Parser deterministico sul cartiglio (coordinate degli elementi di testo): è la via principale.
  //    Una pagina con cartiglio non riconosciuto (formato nuovo, scansione, ecc.) passa all'AI.
  const layout = body.pageItems?.length ? parseDocument(body.pageItems) : [];
  const layoutByPagina = new Map(layout.filter((r) => r.ok && r.item).map((r) => [r.pagina, r.item!]));
  const paginePerAi = pageTexts.map((_, i) => i + 1).filter((n) => !layoutByPagina.has(n));

  console.log(
    `[import-scheda/parse] ${pageTexts.length} pagina/e — layout: ${layoutByPagina.size}, fallback AI: ${paginePerAi.length}` +
    (paginePerAi.length ? ` (pagine ${paginePerAi.join(", ")})` : ""),
  );

  const aiByPagina = new Map<number, Record<string, unknown>>();
  let aiError: string | null = null;
  if (paginePerAi.length) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      aiError = "ANTHROPIC_API_KEY non configurata";
    } else {
      const ai = await parseWithAi(apiKey, paginePerAi.map((n) => ({ n, text: pageTexts[n - 1] ?? "" })));
      if (ai.error) aiError = ai.error; else for (const [n, it] of ai.items) aiByPagina.set(n, it);
    }
  }

  const items = pageTexts.map((_, idx) => {
    const n = idx + 1;
    const fromLayout = layoutByPagina.get(n);
    if (fromLayout) return fromLayout;
    const fromAi = aiByPagina.get(n);
    if (fromAi) return { ...fromAi, pagina: n, source: "ai", warnings: ["Cartiglio non riconosciuto: campi estratti con AI, da verificare"] };
    return {
      pagina: n, paginaMancante: true, numeroScheda: "", commessaNr: "", termineDiConsegna: null,
      codiceArticolo: null, posizione: null, fornitore: null, quantita: null,
      warnings: [aiError ? `Cartiglio non riconosciuto e AI non disponibile: ${aiError}` : "Cartiglio non riconosciuto"],
    };
  });
  const paginePersi = items.filter((it) => "paginaMancante" in it && it.paginaMancante).map((it) => it.pagina);

  console.log(
    "[import-scheda/parse] completato",
    items.map((it) => ({ pagina: it.pagina, numeroScheda: it.numeroScheda, termineDiConsegna: it.termineDiConsegna })),
  );
  return NextResponse.json({ ok: true, items, paginePersi });
}

// Fallback LLM per le sole pagine il cui cartiglio non è stato riconosciuto dal parser a coordinate.
async function parseWithAi(
  apiKey: string,
  pages: Array<{ n: number; text: string }>,
): Promise<{ items: Map<number, Record<string, unknown>>; error?: string }> {
  const items = new Map<number, Record<string, unknown>>();
  const pageTexts = pages.map((p) => p.text);
  // Build page sections (first 1500 chars per page is plenty for header data)
  const pageSections = pages
    .map((p) => `[PAGINA ${p.n}]\n${p.text.slice(0, 1500).trim()}`)
    .join("\n\n---\n\n");

  const schemaExample = JSON.stringify(
    {
      items: [
        {
          pagina: "numero della pagina PDF di origine — DEVE corrispondere esattamente a N in [PAGINA N] qui sopra",
          numeroScheda: "POSIZIONE + ' - ' + DESCRIZIONE PRINCIPALE della pagina (es: '01 - CORNICI VIP')",
          commessaNr: "SOLO la parte numerica della commessa (es: '25306' da 'GGCT-25306-HXBP')",
          termineDiConsegna: "YYYY-MM-DD oppure null — vedi regole sotto",
          codiceArticolo: "codice articolo/pezzo specifico oppure null. NON mettere il numero commessa.",
          posizione: "numero di posizione oppure null",
          fornitore: "subfornitore ESTERNO (es: 'Cattaneo'). NON 'MODAR'. null se lavorazione interna.",
          quantita: "numero intero oppure null",
          otherFields: { CAMPO: "valore stringa" },
        },
      ],
    },
    null,
    2,
  );

  const rules = [
    "UN ITEM PER PAGINA PDF — non estrarre singole righe della distinta/BOM come item separati.",
    "pagina è OBBLIGATORIO su ogni item e deve riportare esattamente il numero N dell'etichetta [PAGINA N] da cui proviene quell'item — serve ad associare ogni item alla pagina giusta anche se una pagina viene saltata o il testo di una pagina è scarso/vuoto. Restituisci un item per OGNI [PAGINA N] presente nell'input, nell'ordine in cui vuoi, con il campo pagina sempre corretto — mai per posizione nell'array.",
    "Se una pagina ha testo scarso o vuoto, restituisci comunque un item con quel numero di pagina e gli altri campi null, non saltarla.",
    "commessaNr è solo il numero numerico (es: '25306'). Non confonderlo con codiceArticolo.",
    "codiceArticolo è il codice specifico dell'articolo, non la commessa. null se non trovato.",
    "fornitore: MODAR è l'azienda committente/produttrice — NON va MAI messo in 'fornitore'. Cerca il subfornitore esterno specifico della pagina (es: Cattaneo, Rossi Srl, ecc.). Se non c'è, metti null.",
    "termineDiConsegna: cerca ESATTAMENTE l'etichetta 'TERMINE DI CONSEGNA' nel testo della pagina e prendi la data associata a quell'etichetta. NON è la data di emissione/stampa del documento né una data d'ordine — se nella pagina compaiono più date, usa solo quella accanto a 'TERMINE DI CONSEGNA', ignora le altre.",
    "'TERMINE DI CONSEGNA' e 'DATA ORDINE' sono due etichette DIVERSE e vicine tra loro nel layout — non scambiarle mai. Se 'TERMINE DI CONSEGNA' compare come etichetta ma il valore accanto è vuoto/assente, restituisci termineDiConsegna: null — NON prendere in quel caso la data di 'DATA ORDINE' né nessun'altra data della pagina come sostituto.",
    "La lista componenti/distinta base va in otherFields come testo, non come item separati.",
    "otherFields: solo valori stringa semplici, nessun oggetto annidato.",
    "Restituisci SOLO il JSON grezzo senza markdown, senza ```json, senza altro testo.",
  ]
    .map((r) => `- ${r}`)
    .join("\n");

  const prompt =
    `Sei un assistente per l'estrazione di metadati da schede di produzione tecniche in PDF.\n\n` +
    `Di seguito il testo estratto da ${pageTexts.length} pagina/e di un PDF (le etichette [PAGINA N] riportano il numero reale della pagina):\n\n` +
    `${pageSections}\n\n` +
    `COMPITO: estrai UN SOLO ITEM PER PAGINA PDF e restituisci SOLO un JSON valido con questa struttura:\n` +
    `${schemaExample}\n\n` +
    `REGOLE CRITICHE:\n${rules}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = errBody?.error?.message ?? `HTTP ${response.status}`;
    console.error("[parse] Claude API error:", msg);
    return { items, error: `Claude API: ${msg}` };
  }

  const result = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = result.content[0]?.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as { items?: Array<Record<string, unknown>> };
    // Non ci si può fidare dell'ordine dell'array per associare item↔pagina: se il modello salta
    // una pagina o ne inverte due, il resto si disallinea in cascata. Si indicizza sul campo
    // "pagina" dichiarato dal modello, accettando solo i numeri di pagina effettivamente richiesti.
    const richieste = new Set(pages.map((p) => p.n));
    for (const it of parsed.items ?? []) {
      const n = Number(it?.pagina);
      if (Number.isInteger(n) && richieste.has(n) && !items.has(n)) items.set(n, it);
    }
    return { items };
  } catch (e) {
    console.error("[parse] JSON parse error:", e, "\ntext:", text);
    return { items, error: "Errore parsing risposta AI" };
  }
}
