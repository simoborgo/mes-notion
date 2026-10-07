import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY non configurata" }, { status: 500 });
  }

  const body = (await req.json()) as { pageTexts?: string[]; pdfText?: string };
  const pageTexts: string[] = body.pageTexts ?? (body.pdfText ? [body.pdfText] : []);

  if (!pageTexts.length || !pageTexts.some((t) => t.trim())) {
    return NextResponse.json({ ok: false, error: "Testo PDF mancante" }, { status: 400 });
  }

  console.log(`[import-scheda/parse] avvio estrazione AI — ${pageTexts.length} pagina/e`);

  // Build page sections (first 1500 chars per page is plenty for header data)
  const pageSections = pageTexts
    .map((t, i) => `[PAGINA ${i + 1}]\n${t.slice(0, 1500).trim()}`)
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
    `Il PDF ha ${pageTexts.length} pagina/e. Di seguito il testo estratto da ciascuna:\n\n` +
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
    return NextResponse.json({ ok: false, error: `Claude API: ${msg}` }, { status: 500 });
  }

  const result = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = result.content[0]?.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawItems: any[] = (parsed as any)?.items ?? [];

    // Non ci si può fidare dell'ordine dell'array per associare item↔pagina: se il modello salta
    // una pagina (testo scarso/vuoto) o ne inverte due, il resto si disallinea in cascata e ogni
    // item finisce associato alla pagina sbagliata nella preview. Si reindicizza invece sul campo
    // "pagina" dichiarato dal modello, con un placeholder esplicito per le pagine mancanti.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byPagina = new Map<number, any>();
    for (const it of rawItems) {
      const p = Number(it?.pagina);
      if (Number.isInteger(p) && p >= 1 && p <= pageTexts.length && !byPagina.has(p)) byPagina.set(p, it);
    }
    const items = Array.from({ length: pageTexts.length }, (_, idx) => {
      const found = byPagina.get(idx + 1);
      if (found) return found;
      return {
        pagina: idx + 1,
        paginaMancante: true,
        numeroScheda: "", commessaNr: "", termineDiConsegna: null,
        codiceArticolo: null, posizione: null, fornitore: null, quantita: null,
      };
    });
    const paginePersi = items.filter((it) => it.paginaMancante).map((it) => it.pagina);

    console.log(
      `[import-scheda/parse] estrazione completata — ${items.length} pagina/e, item ricevuti dal modello: ${rawItems.length}` +
      (paginePersi.length ? `, pagine senza item valido: ${paginePersi.join(", ")}` : ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items.map((it: any) => ({ pagina: it.pagina, numeroScheda: it.numeroScheda, termineDiConsegna: it.termineDiConsegna })),
    );
    return NextResponse.json({ ok: true, items, paginePersi });
  } catch (e) {
    console.error("[parse] JSON parse error:", e, "\ntext:", text);
    return NextResponse.json({ ok: false, error: "Errore parsing risposta AI", rawText: text }, { status: 500 });
  }
}
