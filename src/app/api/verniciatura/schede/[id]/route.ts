import { NextRequest, NextResponse } from "next/server";
import { getSchedaById, updateScheda, disattivaLineage } from "@/lib/schedeVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scheda = await getSchedaById(id);
    return NextResponse.json(scheda);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

// nome/note/essenza/ignifuga/codiceCampioneMaterialista/dataProva sono sempre modificabili, anche
// a scheda approvata/rifiutata: non fanno parte della "ricetta" né di cliente/barcode (fissi).
// Per modificare fasi/prodotti va usato genera-figlio se la scheda è già approvata/rifiutata.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const scheda = await updateScheda(id, {
      nome: body.nome,
      note: body.note,
      essenza: body.essenza,
      ignifuga: body.ignifuga,
      codiceCampioneMaterialista: body.codiceCampioneMaterialista,
      dataProva: body.dataProva,
    });
    void logOperation(session.name, "UPDATE", "scheda_verniciatura", id, body);
    return NextResponse.json(scheda);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/verniciatura/schede]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Elimina l'intera storia versioni della scheda (bozze/rifiutate/approvate), non solo la riga
// puntata dall'id — vedi disattivaLineage per il perché.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    const ids = await disattivaLineage(id);
    void logOperation(session.name, "DELETE", "scheda_verniciatura", id, { azione: "elimina_lineage", ids });
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/schede]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
