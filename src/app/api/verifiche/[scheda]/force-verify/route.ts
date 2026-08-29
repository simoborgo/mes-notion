import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { repo, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest, SPEDIZIONI_ROLES } from "@/lib/auth";
import { updateSchedaStato } from "@/lib/schedeRepository";

export async function POST(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params;
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: "ID scheda non valido" }, { status: 400 });
  }

  const session = await getSessionFromRequest(req);
  if (!session || !SPEDIZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  let schedaNumero: string | null = null;
  try {
    const body = await req.json() as { schedaNumero?: string };
    schedaNumero = body.schedaNumero ?? null;
  } catch { /* body assente */ }

  // Aggiorna PostgreSQL → stato verificato
  const record = await repo.forceVerify({
    notionPageId: scheda,
    schedaNumero,
    operatore: session.name,
  });

  await repo.appendLog({
    schedaNumero: schedaNumero ?? scheda,
    operatore: session.name,
    azione: "finalizzazione",
    dettaglio: {},
  });

  // schede.id riusa il notion_page_id (vedi schema_schede.sql) — stesso valore di `scheda` qui,
  // nessun lookup necessario. Stesso fix di finalize/route.ts (deciso con l'utente 2026-08-29).
  try {
    await updateSchedaStato(scheda, "Verificato");
  } catch (e) {
    console.error("[force-verify] impossibile aggiornare schede.stato a Verificato:", (e as Error).message);
  }

  revalidatePath("/spedizioni");
  revalidatePath("/schede");

  return NextResponse.json({ ok: true, record });
}
