import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { chiudiInventario, getInventarioById } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  const sessione = await getInventarioById(id);
  if (!sessione || sessione.stato !== "aperto") {
    return NextResponse.json({ error: "Inventario non trovato o già chiuso" }, { status: 404 });
  }

  const chiuso = await chiudiInventario(id, session.name);
  void logOperation(session.name, "UPDATE", "inventario_magazzino", id, { categoria: "vernici", stato: "chiuso" });
  revalidatePath("/verniciatura/magazzino/inventario");
  revalidatePath(`/verniciatura/magazzino/inventario/${id}`);

  return NextResponse.json(chiuso);
}
