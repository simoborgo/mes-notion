import { NextRequest, NextResponse } from "next/server";
import { createRitiro, updateSchedaStato, getFornitoriList, appendFotoToPage } from "@/lib/notion";
import { getSessionFromRequest, CARICO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const DESTINAZIONI = new Set(["Magazzino interno", "Fornitore esterno"]);
const MAX_BASE64_CHARS = 14 * 1024 * 1024; // base64 of 10 MB ≈ 13.3 MB

const STATO_PER_DESTINAZIONE: Record<string, string> = {
  "Magazzino interno": "Materiale Pronto",
  "Fornitore esterno": "In Lavorazione Esterna",
};

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !CARICO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const {
    odp_page_id,
    odp_label,
    cliente_info,
    foto_base64,
    destinazione,
    note,
    crea_ritiro,
    ritiro_data,
    ritiro_fornitore,
    figlie_page_ids,
  } = body as Record<string, unknown>;

  if (!odp_page_id || typeof odp_page_id !== "string") {
    return NextResponse.json({ error: "Campo odp_page_id mancante" }, { status: 400 });
  }
  const fotoArray = Array.isArray(foto_base64)
    ? (foto_base64 as string[])
    : foto_base64 ? [foto_base64 as string] : [];
  if (fotoArray.length === 0) {
    return NextResponse.json({ error: "Foto mancante" }, { status: 400 });
  }
  for (const f of fotoArray) {
    if (typeof f !== "string" || f.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: "Foto troppo grande (max 10 MB)" }, { status: 400 });
    }
  }
  const dest = (destinazione as string) || "Magazzino interno";
  if (!DESTINAZIONI.has(dest)) {
    return NextResponse.json({ error: "Destinazione non valida" }, { status: 400 });
  }

  // 1. Aggiorna stato Notion direttamente (sempre — non dipende da n8n)
  const statoNotion = STATO_PER_DESTINAZIONE[dest];
  try {
    await updateSchedaStato(odp_page_id, statoNotion);
  } catch (e) {
    console.error("[carico] updateSchedaStato error:", e);
    return NextResponse.json(
      { error: "Impossibile aggiornare lo stato su Notion" },
      { status: 502 }
    );
  }

  // 1b. Aggiorna sottoschede se richiesto (solo Magazzino interno)
  const figlieIds = Array.isArray(figlie_page_ids)
    ? (figlie_page_ids as string[]).filter(id => typeof id === "string")
    : [];
  if (figlieIds.length > 0 && dest === "Magazzino interno") {
    const results = await Promise.allSettled(
      figlieIds.map(id => updateSchedaStato(id, statoNotion))
    );
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) console.warn(`[carico] ${failed}/${figlieIds.length} sottoschede non aggiornate`);
  }

  const warnings: string[] = [];

  // 2. Chiama n8n con payload minimale — solo notifica Telegram
  const webhookUrl = process.env.N8N_WEBHOOK_CARICO_PROD ?? process.env.N8N_WEBHOOK_CARICO;
  if (webhookUrl) {
    const destLabel = dest === "Fornitore esterno" && ritiro_fornitore
      ? String(ritiro_fornitore).trim()
      : dest;
    const telegramPayload = {
      tipo: "carico",
      operatore: session.name,
      odp_label,
      destinazione: destLabel,
      stato_notion: statoNotion,
      note: note ?? "",
      timestamp: (body.timestamp as string | undefined) ?? new Date().toISOString(),
      foto_base64: fotoArray.length > 0 ? [fotoArray[0]] : [],
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const n8nRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!n8nRes.ok) {
        console.warn(`[carico] n8n ${n8nRes.status}`);
        warnings.push("Notifica Telegram non inviata");
      }
    } catch (e) {
      clearTimeout(timeout);
      const msg = e instanceof Error && e.name === "AbortError" ? "timeout" : (e instanceof Error ? e.message : String(e));
      console.warn("[carico] n8n:", msg);
      warnings.push("Notifica Telegram non inviata");
    }
  }

  // 3. Crea riga Ritiri se richiesto (Fornitore esterno)
  if (crea_ritiro) {
    try {
      const fornitoriList = await getFornitoriList();
      const fornitoreNome = ritiro_fornitore ? String(ritiro_fornitore).trim() : null;
      const fornitoreId = fornitoreNome
        ? (fornitoriList.find(f => f.nome === fornitoreNome)?.id ?? null)
        : null;
      const nuovoRitiro = await createRitiro({
        causale: cliente_info
          ? `Uscita - ${String(cliente_info)}`
          : `Uscita - ${String(odp_label || odp_page_id)}`,
        tipoMovimento: "Consegna",
        dataTrasporto: ritiro_data ? String(ritiro_data) : new Date().toISOString().slice(0, 10),
        schedaId: odp_page_id ? String(odp_page_id) : null,
        fornitoreId,
      });
      // Carica le stesse foto anche nel campo Foto del ritiro
      if (fotoArray.length) {
        void appendFotoToPage(nuovoRitiro.id, fotoArray).catch(e =>
          console.error("[carico] appendFoto ritiro:", e)
        );
      }
    } catch (e) {
      console.error("[carico] createRitiro error:", e);
      warnings.push("Riga Ritiri non creata — verificare su Notion");
    }
  }

  void logOperation(
    session?.name ?? "Sconosciuto",
    "CREATE",
    "carico",
    String(odp_page_id),
    { odp_label, destinazione, crea_ritiro, note, stato_notion: statoNotion }
  );

  if (warnings.length > 0) {
    return NextResponse.json({ ok: true, warnings }, { status: 207 });
  }

  return NextResponse.json({ ok: true });
}
