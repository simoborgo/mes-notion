import { NextRequest, NextResponse } from "next/server";
import { getPiantaById, getVista, setVista } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, PIANTE_ROLES } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; pianteId: string }> };

// Immagine di visione della pianta: cambia solo con la sostituzione del file (il client aggiunge ?v=).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  const jpeg = await getVista(pianteId);
  if (!jpeg) return NextResponse.json({ error: "Vista non disponibile" }, { status: 404 });
  return new NextResponse(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length), "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

// Salvata dal browser dopo l'upload o la sostituzione del file; body = JPEG grezzo.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !PIANTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > 15_000_000) return NextResponse.json({ error: "Immagine non valida" }, { status: 400 });
  await setVista(pianteId, buf);
  return NextResponse.json({ ok: true });
}
