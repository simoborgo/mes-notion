import { NextRequest, NextResponse } from "next/server";
import { getSchedaById } from "@/lib/schedeRepository";
import { creaScaricoMateriale } from "@/lib/scaricoMaterialeRepository";
import { sendNotifica } from "@/lib/notify";
import { getSessionFromRequest, SCARICO_MATERIALE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const MAX_BASE64_CHARS = 14 * 1024 * 1024; // base64 di 10 MB ≈ 13.3 MB

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !SCARICO_MATERIALE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const { odp_page_id, odp_label, descrizione, foto_base64 } = body;

  const descrizioneTrim = typeof descrizione === "string" ? descrizione.trim() : "";
  if (!descrizioneTrim) {
    return NextResponse.json({ error: "La descrizione è obbligatoria" }, { status: 400 });
  }

  const fotoArray = Array.isArray(foto_base64) ? (foto_base64 as string[]) : foto_base64 ? [foto_base64 as string] : [];
  if (fotoArray.length === 0) {
    return NextResponse.json({ error: "Foto mancante" }, { status: 400 });
  }
  for (const f of fotoArray) {
    if (typeof f !== "string" || f.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: "Foto troppo grande (max 10 MB)" }, { status: 400 });
    }
  }

  const schedaId = odp_page_id && typeof odp_page_id === "string" ? odp_page_id : null;
  const odpLabel = odp_label && typeof odp_label === "string" ? odp_label : null;

  const warnings: string[] = [];
  let pdfUrl: string | null = null;
  if (schedaId) {
    try {
      const scheda = await getSchedaById(schedaId);
      pdfUrl = scheda.pdfAllegato?.[0]?.url ?? null;
    } catch (e) {
      console.error("[scarico-materiale] getSchedaById:", e);
      warnings.push("Impossibile recuperare il PDF della Scheda collegata");
    }
  }

  const riga = await creaScaricoMateriale({
    operatore: session.name,
    schedaId,
    odpLabel,
    descrizione: descrizioneTrim,
  });

  const result = await sendNotifica({
    entityType: "scarico_materiale",
    entityId: riga.id,
    eventType: "invio",
    eventId: riga.id,
    webhookUrl: process.env.N8N_WEBHOOK_SCARICO_MATERIALE,
    payload: {
      tipo: "scarico_materiale",
      operatore: session.name,
      odp_label: odpLabel,
      descrizione: descrizioneTrim,
      timestamp: new Date().toISOString(),
      foto_base64: fotoArray.length > 0 ? [fotoArray[0]] : [],
      pdf_url: pdfUrl,
    },
  });
  if (result.warning) warnings.push(result.warning);

  void logOperation(session.name, "CREATE", "scarico_materiale", riga.id, { odpLabel, descrizione: descrizioneTrim, schedaId });

  if (warnings.length > 0) {
    return NextResponse.json({ ok: true, warnings }, { status: 207 });
  }
  return NextResponse.json({ ok: true });
}
