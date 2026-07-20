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

  const prompt = `Sei un assistente per l'estrazione di metadati da schede di produzione PDF.

Analizza il seguente testo estratto da una scheda di produzione e restituisci i dati strutturati.

TESTO PDF:
${pdfText.slice(0, 8000)}

Estrai i campi e restituisci SOLO un JSON valido con questo formato (nessun testo aggiuntivo, nessun markdown):
{
  "items": [
    {
      "numeroScheda": "POSIZIONE + spazio + trattino + spazio + DESCRIZIONE (es: '01 - CORNICI VIP')",
      "commessaNr": "solo il numero commessa senza prefissi letterali (es: '25306' da 'GGCT-25306-HXBP')",
      "termineDiConsegna": "YYYY-MM-DD oppure null",
      "dataOrdine": "YYYY-MM-DD oppure null",
      "tipologia": "Scheda",
      "codiceArticolo": "codice articolo oppure null",
      "posizione": "posizione (es: '01') oppure null",
      "fornitore": "nome fornitore oppure null",
      "quantita": numero intero oppure null,
      "otherFields": { "CAMPO": "valore" }
    }
  ]
}

Regole:
- Se ci sono più righe con FORNITORE diverso, crea un item per ciascuna (il primo è parent, gli altri sottoschede)
- "commessaNr" è solo la parte numerica (es: "25306")
- Date: formato ISO YYYY-MM-DD, null se non presente
- "otherFields": includi FINITURA, NOTE, MATERIALE, DESCRIZIONE MACCHINA e altri campi trovati
- Restituisci SOLO il JSON grezzo, senza \`\`\`json o altro testo`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[parse] Claude API error:", err);
    return NextResponse.json({ ok: false, error: "Errore Claude API" }, { status: 500 });
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
