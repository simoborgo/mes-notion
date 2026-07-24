import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { getRegistrazioniPerData, getUltimoOdpMap } from "@/lib/oreRepository";
import { getAssenzeApprovatePerData, isAssente } from "@/lib/permessiRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

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

    const [registrazioni, ultimoOdpMap, assenzeResult] = await Promise.all([
      getRegistrazioniPerData(data),
      getUltimoOdpMap(matricole),
      getAssenzeApprovatePerData(data).then(
        assenze => ({ ok: true as const, assenze }),
        e => ({ ok: false as const, error: (e as Error).message })
      ),
    ]);

    const registrazioniPerMatricola = new Map<string, typeof registrazioni>();
    for (const r of registrazioni) {
      const list = registrazioniPerMatricola.get(r.matricola) ?? [];
      list.push(r);
      registrazioniPerMatricola.set(r.matricola, list);
    }

    const presenti = operatori.map(o => {
      const assenza = assenzeResult.ok ? isAssente(o.cognome, o.nome, assenzeResult.assenze) : null;
      return {
        matricola: o.matricola,
        cognome: o.cognome,
        nome: o.nome,
        azienda: o.azienda,
        reparto: o.reparto,
        tipo: o.tipo,
        assenza,
        ultimoOdp: ultimoOdpMap[o.matricola] ?? null,
        registrazioni: registrazioniPerMatricola.get(o.matricola) ?? [],
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
