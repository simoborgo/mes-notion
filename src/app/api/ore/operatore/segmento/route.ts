import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { apriSegmento } from "@/lib/segmentiOperatoreRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { matricola, odp, rif } = body;
  if (!matricola || !odp) {
    return NextResponse.json({ error: "matricola e odp sono obbligatori" }, { status: 400 });
  }

  try {
    const operatori = await getOperatori();
    const op = operatori.find(o => o.matricola === matricola);
    if (!op) return NextResponse.json({ error: "Operatore non trovato o non più in forza" }, { status: 404 });

    const segmento = await apriSegmento(
      { matricola: op.matricola, cognome: op.cognome, nome: op.nome, azienda: op.azienda, reparto: op.reparto },
      odp,
      !!rif
    );
    void logOperation(`${op.cognome} ${op.nome}`, "CREATE", "ore_registrate", `${matricola}:${odp}`, { via: "tablet-operatore", accountSessione: session.name, rif: !!rif });
    return NextResponse.json({ ok: true, segmento });
  } catch (e) {
    console.error("[ore/operatore/segmento]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
