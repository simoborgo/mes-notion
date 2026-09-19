import { NextRequest, NextResponse } from "next/server";
import { getFaseCncInLavorazione, segnaFaseCompletata } from "@/lib/schedeFasiRepository";
import { ricalcolaPiano } from "@/lib/apsSchedulerRepository";
import { getOperatori } from "@/lib/operatoriRepository";
import { getSessionFromRequest, getOperatoreMatricolaFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Dichiarazione di chiusura della fase CNC dal tablet operatore (cambio ODP, vedi
// promptCompletamentoCnc in /api/ore/operatore/segmento) — auth più debole della route admin
// equivalente (/api/schede/[id]/fasi/[faseId]/completa), quindi ri-risolve la fase da `odp`
// invece di fidarsi ciecamente del `faseId` ricevuto: se nel frattempo la fase non è più "In
// lavorazione" su CNC per quell'odp (già completata da un admin, o scelta obsoleta) rifiuta senza
// completare nulla — mai un modo alternativo di completare una fase arbitraria di un altro reparto.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const matricola = await getOperatoreMatricolaFromRequest(req);
  if (!matricola) return NextResponse.json({ error: "PIN operatore non verificato o scaduto" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { odp, faseId } = body;
  if (!odp || !faseId) {
    return NextResponse.json({ error: "odp e faseId obbligatori" }, { status: 400 });
  }

  try {
    const fase = await getFaseCncInLavorazione(odp);
    if (!fase || fase.id !== faseId) {
      return NextResponse.json({ error: "Fase non più in lavorazione su CNC per questo ODP" }, { status: 409 });
    }
    const cambiato = await segnaFaseCompletata(faseId);
    if (cambiato) {
      const operatori = await getOperatori();
      const op = operatori.find(o => o.matricola === matricola);
      void logOperation(op ? `${op.cognome} ${op.nome}` : matricola, "UPDATE", "scheda", fase.schedaId, {
        azione: "completa_fase_aps", faseId, odp, via: "tablet-operatore-cnc",
      });
      void ricalcolaPiano();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ore/operatore/fase-cnc-completa]", e);
    return NextResponse.json({ error: "Errore nel completamento fase" }, { status: 500 });
  }
}
