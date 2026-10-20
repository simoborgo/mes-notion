import { NextRequest, NextResponse } from "next/server";
import { getSchedaById } from "@/lib/schedeRepository";
import { getContatoriOre, getValoreVendita, getTariffaOraria } from "@/lib/schedeEconomiaRepository";
import { getSessionFromRequest } from "@/lib/auth";

// Contatori ore (tutti i ruoli) + valori in € (solo admin: vendita e tariffa per le conversioni).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const { id } = await params;
    const scheda = await getSchedaById(id);
    const contatori = await getContatoriOre(scheda.odp, scheda.codiceArticolo);
    if (session.role !== "admin") return NextResponse.json(contatori);
    const [valoreVendita, tariffa] = await Promise.all([getValoreVendita(id), getTariffaOraria()]);
    return NextResponse.json({ ...contatori, admin: { valoreVendita, tariffa } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore lettura dati economici" }, { status: 500 });
  }
}
