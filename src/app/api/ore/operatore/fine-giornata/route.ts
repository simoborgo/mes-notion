import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/operatoriRepository";
import { chiudiSegmentoCorrente } from "@/lib/segmentiOperatoreRepository";
import { getSessionFromRequest, getOperatoreMatricolaFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const matricola = await getOperatoreMatricolaFromRequest(req);
  if (!matricola) return NextResponse.json({ error: "PIN operatore non verificato o scaduto" }, { status: 401 });

  try {
    const operatori = await getOperatori();
    const op = operatori.find(o => o.matricola === matricola);
    if (!op) return NextResponse.json({ error: "Operatore non trovato o non più in forza" }, { status: 404 });

    await chiudiSegmentoCorrente({ matricola: op.matricola, cognome: op.cognome, nome: op.nome, azienda: op.azienda, reparto: op.reparto });
    void logOperation(`${op.cognome} ${op.nome}`, "UPDATE", "ore_registrate", matricola, { via: "tablet-operatore", accountSessione: session.name, azione: "fine-giornata" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ore/operatore/fine-giornata]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
