import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/operatoriRepository";
import { apriSegmento, registraSegmentoRetroattivo, getSegmentoAperto, getSegmentiOggi } from "@/lib/segmentiOperatoreRepository";
import { getOrariTurno, OrariTurno } from "@/lib/parametriGeneraliRepository";
import { getSessionFromRequest, getOperatoreMatricolaFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Oltre questa soglia dall'inizio nominale del turno, la conferma del primo ODP della giornata
// chiede prima all'operatore se ha già lavorato su qualcosa (vedi doc del "buco" di inizio
// giornata) — sotto soglia si presume solo un normale ritardo nel prendere in mano il tablet.
const SOGLIA_GAP_MINUTI = 30;

function oggiStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Orario nominale di inizio turno di oggi, o null di domenica — nessun orario configurato per
// quel giorno, il tablet non dovrebbe essere in uso: meglio non bloccare né chiedere nulla.
function inizioTurnoOggi(now: Date, orari: OrariTurno): Date | null {
  const giorno = now.getDay();
  if (giorno === 0) return null;
  const orario = giorno === 6 ? orari.turnoSabatoInizio : orari.turnoFerialeInizio;
  const [ore, minuti] = orario.split(":").map(Number);
  const d = new Date(now);
  d.setHours(ore, minuti, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const matricola = await getOperatoreMatricolaFromRequest(req);
  if (!matricola) return NextResponse.json({ error: "PIN operatore non verificato o scaduto" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { odp, rif, gapRisposta } = body;
  if (!odp) {
    return NextResponse.json({ error: "odp obbligatorio" }, { status: 400 });
  }

  try {
    const operatori = await getOperatori();
    const op = operatori.find(o => o.matricola === matricola);
    if (!op) return NextResponse.json({ error: "Operatore non trovato o non più in forza" }, { status: 404 });

    const opDati = { matricola: op.matricola, cognome: op.cognome, nome: op.nome, azienda: op.azienda, reparto: op.reparto };

    // iniziatoAlle del nuovo segmento: "adesso" di norma, ma se questa è la prima conferma della
    // giornata ed è arrivata entro la soglia di tolleranza dal buco, si fa partire dall'orario
    // nominale di inizio turno — altrimenti quei minuti andrebbero persi anche senza bisogno di
    // chiedere nulla all'operatore (sotto soglia si presume solo il normale tempo di avvio giornata).
    let iniziatoAlleOverride: Date | undefined;

    // Nessuna risposta al gap ancora ricevuta: valuta se questa è la prima conferma della
    // giornata e se è arrivata abbastanza tardi da valer la pena chiedere. In tal caso si ferma
    // qui, senza scrivere nulla — il client mostrerà la domanda e ritenterà con gapRisposta valorizzata.
    if (!gapRisposta) {
      const now = new Date();
      const [aperto, segmentiOggi] = await Promise.all([getSegmentoAperto(matricola), getSegmentiOggi(matricola, oggiStr(now))]);
      const primoDellaGiornata = !aperto && segmentiOggi.length === 0;
      if (primoDellaGiornata) {
        const orari = await getOrariTurno();
        const inizioTurno = inizioTurnoOggi(now, orari);
        if (inizioTurno) {
          const ritardoMs = now.getTime() - inizioTurno.getTime();
          if (ritardoMs > SOGLIA_GAP_MINUTI * 60_000) {
            return NextResponse.json({ gapRichiesto: true, inizioTurno: inizioTurno.toISOString(), oraAttuale: now.toISOString() });
          }
          if (ritardoMs > 0) iniziatoAlleOverride = inizioTurno;
        }
      }
    }

    if (gapRisposta && typeof gapRisposta === "object" && gapRisposta.odpGap) {
      const now = new Date();
      const orari = await getOrariTurno();
      const inizioTurno = inizioTurnoOggi(now, orari) ?? now;
      await registraSegmentoRetroattivo(opDati, gapRisposta.odpGap, inizioTurno, now);
    }

    const segmento = await apriSegmento(opDati, odp, !!rif, iniziatoAlleOverride);
    void logOperation(`${op.cognome} ${op.nome}`, "CREATE", "ore_registrate", `${matricola}:${odp}`, {
      via: "tablet-operatore", accountSessione: session.name, rif: !!rif,
      gapOdp: gapRisposta && typeof gapRisposta === "object" ? gapRisposta.odpGap ?? null : null,
    });
    return NextResponse.json({ ok: true, segmento });
  } catch (e) {
    console.error("[ore/operatore/segmento]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
