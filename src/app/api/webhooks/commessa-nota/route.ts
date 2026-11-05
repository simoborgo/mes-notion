import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { findCommessaByNumber } from "@/lib/commesseRepository";
import { createNota } from "@/lib/commessaStoricoRepository";
import { createScadenza } from "@/lib/commessaScadenzeRepository";
import { interpretaMessaggio } from "@/lib/messaggioCommessa";
import { dataOggiRoma } from "@/lib/oraLocale";
import { logOperation } from "@/lib/audit";

// Note e scadenze di commessa scritte da Telegram, chiamato dal workflow n8n
// (scripts/n8n/commessa-nota-telegram.json) che filtra le chat autorizzate. Secret nell'header
// x-webhook-secret. Body: { messaggio, autore }. Risponde sempre con `risposta`, il testo che n8n
// rimanda in chat (anche per gli errori, che tornano con status 200/4xx ma testo leggibile).
export async function POST(req: NextRequest) {
  const secret = process.env.COMMESSA_NOTA_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  if (req.headers.get("x-webhook-secret") !== secret) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const body = await req.json();
    const autore = typeof body.autore === "string" && body.autore.trim() ? body.autore.trim() : "Telegram";
    const p = interpretaMessaggio(typeof body.messaggio === "string" ? body.messaggio : "", dataOggiRoma());
    if ("errore" in p) return NextResponse.json({ ok: false, risposta: `⚠️ ${p.errore}` }, { status: 400 });

    const commessa = await findCommessaByNumber(p.commessa);
    if (!commessa) return NextResponse.json({ ok: false, risposta: `⚠️ Commessa «${p.commessa}» non trovata` }, { status: 404 });

    let schedaId: string | null = null;
    if (p.odp) {
      const { rows } = await pool.query(
        `SELECT id FROM schede WHERE commessa_id = $1 AND tipologia = 'Scheda' AND archiviata = false AND odp = $2`,
        [commessa.id, p.odp],
      );
      if (rows.length === 0) return NextResponse.json({ ok: false, risposta: `⚠️ ODP «${p.odp}» non trovato nella commessa ${commessa.numeroCommessa}` }, { status: 404 });
      if (rows.length > 1) return NextResponse.json({ ok: false, risposta: `⚠️ ODP «${p.odp}» ambiguo nella commessa ${commessa.numeroCommessa}` }, { status: 409 });
      schedaId = rows[0].id;
    }

    const dove = `${commessa.numeroCommessa}${p.odp ? ` · ODP ${p.odp}` : ""}`;
    if (p.scadenza) {
      const s = await createScadenza({ commessaId: commessa.id, schedaId, titolo: p.testo, scadenza: p.scadenza, fonte: "telegram", creatoDa: autore });
      void logOperation(autore, "CREATE", "commessa_scadenza", s.id, { commessaId: commessa.id, titolo: p.testo, scadenza: s.scadenza, odp: p.odp, via: "telegram" });
      return NextResponse.json({ ok: true, tipo: "scadenza", id: s.id, risposta: `✅ Scadenza registrata · ${dove}\n${p.testo}\nEntro ${s.scadenza.split("-").reverse().join("/")}` });
    }
    const nota = await createNota({ commessaId: commessa.id, testo: p.odp ? `[ODP ${p.odp}] ${p.testo}` : p.testo, creatoDa: autore });
    await pool.query(`UPDATE commessa_note SET scheda_id = $2, fonte = 'telegram' WHERE id = $1`, [nota.id, schedaId]);
    void logOperation(autore, "CREATE", "commessa_nota", nota.id, { commessaId: commessa.id, odp: p.odp, via: "telegram" });
    return NextResponse.json({ ok: true, tipo: "nota", id: nota.id, risposta: `📝 Nota registrata · ${dove}\n${p.testo}` });
  } catch (e) {
    console.error("[webhooks/commessa-nota]", e);
    return NextResponse.json({ ok: false, risposta: "⚠️ Errore del MES, riprova più tardi" }, { status: 500 });
  }
}
