import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getOrdineConRighe, segnaOrdineEvasoManualmente } from "@/lib/wurthOrdiniRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Override manuale: copre il caso in cui il fornitore ha stornato il residuo di un ordine e
// non arriverà mai — senza questo, l'ordine resterebbe "parziale" per sempre.
export async function POST(req: NextRequest, { params }: { params: Promise<{ ordineId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { ordineId } = await params;
  const ordine = await getOrdineConRighe(ordineId).catch(() => null);
  if (!ordine) {
    return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
  }

  await segnaOrdineEvasoManualmente(ordineId);
  void logOperation(session.name, "UPDATE", "wurth_ordine", ordineId, { statoRicezione: "evaso_manuale" });

  revalidatePath("/ferramenta/ordini-wurth");

  return NextResponse.json({ ok: true, statoRicezione: "evaso_manuale" });
}
