import { NextRequest, NextResponse } from "next/server";
import { getPiantaById, addZona } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, PIANTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const unitario = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; pianteId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !PIANTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, pianteId } = await params;
  const b = await req.json().catch(() => ({}));
  if (![b.x, b.y, b.w, b.h].every(unitario) || b.w < 0.002 || b.h < 0.002) {
    return NextResponse.json({ error: "Rettangolo non valido" }, { status: 400 });
  }
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  try {
    const zona = await addZona({
      piantaId: pianteId, pagina: Number.isInteger(b.pagina) && b.pagina > 0 ? b.pagina : 1,
      x: b.x, y: b.y, w: b.w, h: b.h, schedaId: typeof b.schedaId === "string" && b.schedaId ? b.schedaId : null, creatoDa: session.name,
    });
    void logOperation(session.name, "CREATE", "pianta_zona", zona.id, { piantaId: pianteId, schedaId: zona.schedaId });
    return NextResponse.json(zona, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione zona" }, { status: 500 });
  }
}
