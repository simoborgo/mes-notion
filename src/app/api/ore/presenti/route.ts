import { NextRequest, NextResponse } from "next/server";
import { getSchede } from "@/lib/schedeRepository";
import { getOperatori } from "@/lib/operatoriRepository";
import { getRegistrazioniPerData, getOdpGiornoPrecedenteMap } from "@/lib/oreRepository";
import { getAssenzeApprovatePerData, isAssente } from "@/lib/permessiRepository";
import {
  type AssenzaManuale, getAssenzeManualiPerData, oreDaPermesso, reconciliaAssenzeConPermessi, oreEqual,
} from "@/lib/assenzeRepository";
import { getRepartiSecondari } from "@/lib/articoliRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

// Calcolo esplicito su anno/mese/giorno (non new Date(dataStr) + setDate) per evitare
// spostamenti di fuso orario — stessa tecnica già usata lato client in VistaOggi.tsx.
function giornoPrecedente(dataStr: string): string {
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "Parametro data mancante o non valido (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const operatori = await getOperatori();
    const matricole = operatori.map(o => o.matricola);

    const [registrazioni, odpGiornoPrecedenteMap, assenzeResult, repartiSecondari, schede] = await Promise.all([
      getRegistrazioniPerData(data),
      getOdpGiornoPrecedenteMap(matricole, giornoPrecedente(data)),
      getAssenzeApprovatePerData(data).then(
        assenze => ({ ok: true as const, assenze }),
        e => ({ ok: false as const, error: (e as Error).message })
      ),
      getRepartiSecondari(),
      getSchede(),
    ]);

    // Codice articolo mai salvato su ore_registrate (vedi commento in oreRepository.ts): join a
    // runtime con Notion, così se il codice viene aggiunto sulla Scheda dopo la registrazione
    // delle ore compare comunque subito, anche per le ore già segnate nei giorni passati.
    const codiceArticoloPerOdp = new Map<string, string | null>();
    for (const s of schede) {
      if (s.odp && !codiceArticoloPerOdp.has(s.odp)) codiceArticoloPerOdp.set(s.odp, s.codiceArticolo || null);
    }
    const registrazioniArricchite = registrazioni.map(r => ({
      ...r,
      codiceArticolo: codiceArticoloPerOdp.get(r.odp) ?? null,
    }));

    const registrazioniPerMatricola = new Map<string, typeof registrazioniArricchite>();
    for (const r of registrazioniArricchite) {
      const list = registrazioniPerMatricola.get(r.matricola) ?? [];
      list.push(r);
      registrazioniPerMatricola.set(r.matricola, list);
    }

    // Permesso live per operatore (join con Gestione Permessi) — invariato rispetto a prima.
    const permessoPerMatricola = new Map<string, ReturnType<typeof isAssente>>();
    if (assenzeResult.ok) {
      for (const o of operatori) {
        permessoPerMatricola.set(o.matricola, isAssente(o.cognome, o.nome, assenzeResult.assenze));
      }
    }

    // Assenze manuali/riconciliate: se Permessi è raggiungibile, riconcilia (crea/aggiorna le righe
    // auto-sincronizzate, non tocca quelle modificate a mano) — altrimenti sola lettura di quanto già
    // salvato. Un errore di scrittura qui non deve impedire il caricamento della pagina.
    let assenzeManualiMap: Map<string, AssenzaManuale>;
    if (assenzeResult.ok) {
      const permessiOreMap = new Map<string, number | null>();
      for (const [matricola, permesso] of permessoPerMatricola) {
        if (permesso) permessiOreMap.set(matricola, oreDaPermesso(permesso));
      }
      try {
        assenzeManualiMap = await reconciliaAssenzeConPermessi(data, permessiOreMap);
      } catch (e) {
        console.error("[ore/presenti] riconciliazione assenze fallita", e);
        assenzeManualiMap = await getAssenzeManualiPerData(data).catch(() => new Map());
      }
    } else {
      assenzeManualiMap = await getAssenzeManualiPerData(data).catch(() => new Map());
    }

    const presenti = operatori.map(o => {
      const permesso = permessoPerMatricola.get(o.matricola) ?? null;
      const manuale = assenzeManualiMap.get(o.matricola) ?? null;
      const permessoOre = permesso ? oreDaPermesso(permesso) : null;
      const assenzaManuale = manuale ? {
        ore: manuale.ore,
        modificataManualmente: manuale.modificataManualmente,
        conflitto: manuale.modificataManualmente && permesso !== null && !oreEqual(manuale.ore, permessoOre),
        permessoOreSuggerite: permesso ? permessoOre : null,
      } : null;
      return {
        matricola: o.matricola,
        cognome: o.cognome,
        nome: o.nome,
        azienda: o.azienda,
        reparto: o.reparto,
        tipo: o.tipo,
        assenza: permesso,
        assenzaManuale,
        odpGiornoPrecedente: odpGiornoPrecedenteMap[o.matricola] ?? null,
        registrazioni: registrazioniPerMatricola.get(o.matricola) ?? [],
        repartoSecondarioSuggerito: repartiSecondari.get(o.matricola)?.repartoSecondario ?? null,
      };
    });

    return NextResponse.json({
      presenti,
      warningPermessi: assenzeResult.ok ? null : `Impossibile verificare i permessi/ferie: ${assenzeResult.error}`,
    });
  } catch (e) {
    console.error("[ore/presenti]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
