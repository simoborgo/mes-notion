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

  const { pdfText } = (await req.json()) as { pdfText: string };
  if (!pdfText?.trim()) {
    return NextResponse.json({ ok: false, error: "Testo PDF mancante" }, { status: 400 });
  }

  const prompt = `Sei un assistente per l'estrazione di metadati da schede di produzione tecniche in formato PDF.

TESTO PDF:
${pdfText.slice(0, 8000)}

Estrai i dati e restituisci SOLO un JSON valido con questa struttura (nessun testo, nessun markdown):
{
  "items": [
    {
      "numeroScheda": "stringa: POSIZIONE + ' - ' + DESCRIZIONE principale (es: '01 - CORNICI VIP')",
      "commessaNr": "stringa: SOLO la parte numerica del campo COMMESSA NR o simile. Esempio: da 'GGCT-25306-HXBP' estrai '25306'. NON mettere qui il codice articolo.",
      "termineDiConsegna": "YYYY-MM-DD oppure null — dal campo TERMINE DI CONSEGNA o DATA CONSEGNA",
      "dataOrdine": "YYYY-MM-DD oppure null — dal campo DATA ORDINE",
      "codiceArticolo": "stringa: il CODICE ARTICOLO o CODICE PEZZO specifico dell'articolo (es: 'GGCT-VIP-001'). NON mettere qui il numero commessa. null se assente.",
      "posizione": "stringa: il numero di POSIZIONE (es: '01') oppure null",
      "fornitore": "stringa: nome del FORNITORE oppure null",
      "quantita": "numero intero oppure null",
      "otherFields": { "NOME_CAMPO": "valore stringa" }
    }
  ]
}

REGOLE CRITICHE:
- "commessaNr": è SOLO il numero numerico della commessa (es: "25306"). Non è il codice articolo. Non è l'ODP (l'ODP viene generato automaticamente dal sistema, NON è nel PDF).
- "codiceArticolo": è il codice specifico dell'articolo/pezzo, distinto dalla commessa. null se non trovato esplicitamente.
- "numeroScheda": concatena POSIZIONE + ' - ' + DESCRIZIONE. Se manca la posizione usa solo la descrizione.
- Se più righe hanno FORNITORE diverso: crea un item per ciascuna (il primo è il parent, gli altri le sottoschede).
- Date in formato ISO YYYY-MM-DD; null se assenti o non leggibili.
- "otherFields": tutti gli altri campi (FINITURA, MATERIALE, NOTE, DESCRIZIONE MACCHINA, ecc.) come stringhe piatte. Nessun oggetto annidato.
- Restituisci SOLO il JSON grezzo senza \`\`\`json o altro testo.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
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
    return NextResponse.json({ ok: true, ...parsed });
  } catch (e) {
    console.error("[parse] JSON parse error:", e, "\ntext:", text);
    return NextResponse.json({ ok: false, error: "Errore parsing risposta AI", rawText: text }, { status: 500 });
  }
}
