import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { repo, notionSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest, SPEDIZIONI_ROLES } from "@/lib/auth";

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

  // Aggiorna Notion → stato Verificato (senza PDF)
  let notionError: string | undefined;
  try {
    await notionSvc.aggiornaStatoOdp(scheda, {});
  } catch (e) {
    notionError = (e as Error).message;
    console.error("[force-verify] Notion update fallito:", e);
  }

  await repo.appendLog({
    schedaNumero: schedaNumero ?? scheda,
    operatore: session.name,
    azione: "finalizzazione",
    dettaglio: { notionOk: !notionError },
  });

  revalidatePath("/spedizioni");

  return NextResponse.json({ ok: true, record, notionError });
}
