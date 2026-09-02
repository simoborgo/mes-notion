import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/operatoriRepository";
import { chiudiSegmentoCorrente, getMatricoleConSegmentoAperto } from "@/lib/segmentiOperatoreRepository";
import { getOrariTurno } from "@/lib/parametriGeneraliRepository";
import { logOperation } from "@/lib/audit";
import { dataOggiRoma, giornoSettimanaRoma, orarioRomaAUtc } from "@/lib/oraLocale";

// Orario nominale di fine turno (da Admin → Orari Turno), unica fonte usata per stimare
// l'orario di uscita di chi dimentica di chiudere — NON l'orario di "adesso" (quando passa il
// job schedulato). Con la chiusura automatica pensata come rete di sicurezza principale
// (l'operatore non deve più ricordarsi di premere "Ho finito"), assumere "adesso" gonfierebbe
// sistematicamente le ore di chiunque dimentichi, non solo nei rari casi di straordinario reale.
//
// L'orario configurato ("18:00") è sempre inteso in ora italiana — il processo Node in
// produzione gira in UTC, quindi va convertito con orarioRomaAUtc (che sa gestire ora legale/
// solare) invece che con Date.setHours, che lo interpreterebbe come 18:00 UTC (le 20:00
// italiane d'estate: bug reale trovato il 2026-08-31, chiudeva sempre 1-2h più tardi del dovuto).
function orarioChiusuraPresunta(now: Date, fineTurnoFeriale: string, fineTurnoSabato: string): Date {
  const sabato = giornoSettimanaRoma(now) === 6;
  const target = orarioRomaAUtc(dataOggiRoma(now), sabato ? fineTurnoSabato : fineTurnoFeriale);
  // Se il job schedulato passa prima dell'orario nominale (drift/anticipo), non si può assegnare
  // una chiusura nel futuro rispetto a "adesso" — in quel caso l'unica stima valida resta "adesso".
  return target.getTime() < now.getTime() ? target : now;
}

// Chiamata da uno Schedule Trigger n8n una volta al giorno, dopo l'orario nominale di fine
// turno più tardo (18:30 feriale) — un solo trigger giornaliero basta: la chiusura da assegnare
// non dipende da quando gira il job, ma dal giorno della settimana del segmento aperto.
export async function POST(req: NextRequest) {
  const secret = process.env.ORE_CHIUSURA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const matricole = await getMatricoleConSegmentoAperto();
    if (matricole.length === 0) {
      return NextResponse.json({ ok: true, chiusi: 0, matricole: [], saltati: [] });
    }

    const orariTurno = await getOrariTurno();
    const chiusura = orarioChiusuraPresunta(new Date(), orariTurno.turnoFerialeFine, orariTurno.turnoSabatoFine);
    const operatori = await getOperatori();
    const chiusi: string[] = [];
    const saltati: string[] = [];
    const falliti: string[] = [];

    // Try/catch per singolo operatore (2026-09-02: un vincolo DB mancante su una categoria ha
    // fatto fallire la chiusura di un operatore, interrompendo l'intero ciclo e lasciando aperti
    // anche i segmenti di chi veniva dopo in lista) — un errore isolato non deve mai impedire di
    // processare gli altri operatori in coda.
    for (const matricola of matricole) {
      const op = operatori.find(o => o.matricola === matricola);
      if (!op) {
        saltati.push(matricola);
        continue;
      }
      try {
        await chiudiSegmentoCorrente({ matricola: op.matricola, cognome: op.cognome, nome: op.nome, azienda: op.azienda, reparto: op.reparto }, chiusura);
        void logOperation(`${op.cognome} ${op.nome}`, "UPDATE", "ore_registrate", matricola, { via: "cron-auto", azione: "chiusura-automatica", chiusoAlle: chiusura.toISOString() });
        chiusi.push(matricola);
      } catch (e) {
        const messaggio = e instanceof Error ? e.message : String(e);
        console.error(`[webhooks/ore-chiusura-automatica] chiusura fallita matricola=${matricola}`, e);
        void logOperation("Sistema", "UPDATE", "ore_registrate", matricola, {
          via: "cron-auto", azione: "chiusura-automatica-fallita", errore: messaggio,
        });
        falliti.push(matricola);
      }
    }

    return NextResponse.json({ ok: true, chiusi: chiusi.length, matricole: chiusi, saltati, falliti, chiusoAlle: chiusura.toISOString() });
  } catch (e) {
    console.error("[webhooks/ore-chiusura-automatica]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
