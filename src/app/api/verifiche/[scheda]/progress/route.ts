import { NextRequest, NextResponse } from "next/server";
import { repo, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params; // notion_page_id
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: `ID scheda non valido` }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  const operatore = session.name;

  const holdsIt = await repo.holdsLock(scheda, operatore);
  if (!holdsIt) {
    return NextResponse.json({ ok: false, error: "Lock non detenuto o scaduto: riapri la scheda" }, { status: 423 });
  }

  try {
    const body = await req.json();
    const { strokes, stamps, currentPage, totalPages, fotoCount, schedaNumero } = body;
    const record = await repo.upsertProgress({
      notionPageId: scheda, schedaNumero, operatore,
      annotazioni: { strokes, stamps, currentPage, totalPages },
      fotoCount: fotoCount || 0,
    });
    await repo.appendLog({
      schedaNumero: schedaNumero ?? scheda, operatore, azione: "salvataggio_progresso",
      dettaglio: { pagina: currentPage, fotoCount: fotoCount || 0 },
    });
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("[verifiche/progress]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
