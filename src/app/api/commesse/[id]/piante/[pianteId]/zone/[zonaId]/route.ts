import { NextRequest, NextResponse } from "next/server";
import { getPiantaById, getZonaById, updateZona, deleteZona } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; pianteId: string; zonaId: string }> };

async function verifica(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
    return { errore: NextResponse.json({ error: "Permesso negato" }, { status: 403 }) };
  }
  const { id, pianteId, zonaId } = await params;
  const p = await getPiantaById(pianteId);
  const z = await getZonaById(zonaId);
  if (!p || p.commessaId !== id || !z || z.piantaId !== pianteId) {
    return { errore: NextResponse.json({ error: "Zona non trovata" }, { status: 404 }) };
  }
  return { session, zonaId, pianteId };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const v = await verifica(req, ctx);
  if (v.errore) return v.errore;
  const b = await req.json().catch(() => ({}));
  try {
    const zona = await updateZona(v.zonaId, {
      areaId: b.areaId === undefined ? undefined : (typeof b.areaId === "string" && b.areaId ? b.areaId : null),
    });
    void logOperation(v.session.name, "UPDATE", "pianta_zona", v.zonaId, { areaId: zona.areaId });
    return NextResponse.json(zona);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento zona" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const v = await verifica(req, ctx);
  if (v.errore) return v.errore;
  await deleteZona(v.zonaId);
  void logOperation(v.session.name, "DELETE", "pianta_zona", v.zonaId, { piantaId: v.pianteId });
  return NextResponse.json({ ok: true });
}
