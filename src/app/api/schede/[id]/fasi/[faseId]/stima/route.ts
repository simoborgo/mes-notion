import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getFasiPerScheda, REPARTO_ID_A_NOME_STORICO } from "@/lib/schedeFasiRepository";
import { impostaStimaManuale } from "@/lib/standardRepartoRepository";
import { ricalcolaPiano } from "@/lib/apsSchedulerRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const { id, faseId } = await params;
    const body = await req.json().catch(() => ({}));
    const oreStimate = Number(body.oreStimate);
    if (!Number.isFinite(oreStimate) || oreStimate <= 0) {
      return NextResponse.json({ error: "Ore stimate non valide" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT sf.reparto_id, sf.stato_fase, s.codice_articolo
       FROM schede_fasi sf JOIN schede s ON s.id = sf.scheda_id
       WHERE sf.id = $1 AND sf.scheda_id = $2`,
      [faseId, id]
    );
    const fase = rows[0];
    if (!fase) return NextResponse.json({ error: "Fase non trovata" }, { status: 404 });
    // Una volta iniziato/finito il lavoro, l'ore_stimate non pianifica più nulla (il motore
    // ignora tutto ciò che non è 'Da iniziare') — modificarla sarebbe solo un dato storico
    // fuorviante. Il confronto con la realtà passa da ore_consuntivate (getFasiPerScheda), non
    // da qui.
    if (fase.stato_fase !== "Da iniziare") {
      return NextResponse.json({ error: "La fase non è più 'Da iniziare': la stima non è più modificabile" }, { status: 400 });
    }

    const nomeStorico = REPARTO_ID_A_NOME_STORICO[fase.reparto_id];
    if (!nomeStorico) {
      return NextResponse.json({ error: "Reparto non tracciato in Standard Reparto" }, { status: 400 });
    }
    if (!fase.codice_articolo) {
      return NextResponse.json({ error: "Manca il Codice Articolo sulla Scheda" }, { status: 400 });
    }

    await impostaStimaManuale(fase.codice_articolo, nomeStorico, oreStimate);
    await pool.query(`UPDATE schede_fasi SET ore_stimate = $1, aggiornato_il = now() WHERE id = $2`, [oreStimate, faseId]);

    void logOperation(session.name, "UPDATE", "scheda", id, { azione: "imposta_stima_fase_aps", faseId, oreStimate });
    void ricalcolaPiano();

    const fasi = await getFasiPerScheda(id);
    return NextResponse.json(fasi);
  } catch (e) {
    console.error("[schede/[id]/fasi/[faseId]/stima POST]", e);
    return NextResponse.json({ error: "Errore nell'impostazione della stima" }, { status: 500 });
  }
}
