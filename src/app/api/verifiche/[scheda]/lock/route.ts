import { NextRequest, NextResponse } from "next/server";
import { repo, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params; // scheda = notion_page_id
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: `ID scheda non valido: "${scheda}"` }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const operatore = session.name;
  const schedaNumero: string | null = body.schedaNumero ?? null; // ODP per display/log

  try {
    const prev = await repo.findByNotionPageId(scheda);
    const result = await repo.acquireLock(scheda, schedaNumero, operatore);

    if (!result.acquired) {
      return NextResponse.json(
        { ok: false, lockedBy: result.lockedBy, lockScadenza: result.lockScadenza, error: `Scheda in uso da ${result.lockedBy}` },
        { status: 423 }
      );
    }

    const subentro = prev && (prev as Record<string, unknown>).lock_operatore && (prev as Record<string, unknown>).lock_operatore !== operatore;
    await repo.appendLog({
      schedaNumero: schedaNumero ?? scheda, operatore,
      azione: subentro ? "lock_subentro" : "lock_acquisito",
      dettaglio: subentro ? { precedente: (prev as Record<string, unknown>).lock_operatore } : {},
    });

    return NextResponse.json({ ok: true, record: result.record, ttlMinuti: repo.LOCK_TTL_MINUTI });
  } catch (err) {
    console.error("[verifiche/lock POST]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  const operatore = session.name;

  try {
    const released = await repo.releaseLock(scheda, operatore);
    if (released) {
      const record = await repo.findByNotionPageId(scheda);
      await repo.appendLog({ schedaNumero: (record?.scheda_numero as string) ?? scheda, operatore, azione: "lock_rilasciato", dettaglio: {} });
    }
    return NextResponse.json({ ok: true, released });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
