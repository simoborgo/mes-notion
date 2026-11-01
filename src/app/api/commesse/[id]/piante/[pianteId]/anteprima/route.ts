import { NextRequest, NextResponse } from "next/server";
import { getPiantaById, getAnteprima, setAnteprima } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; pianteId: string }> };

// La miniatura cambia solo con la sostituzione del file; il client aggiunge ?v=<aggiornatoIl>.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  const jpeg = await getAnteprima(pianteId);
  if (!jpeg) return NextResponse.json({ error: "Anteprima non disponibile" }, { status: 404 });
  return new NextResponse(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

// Salvata dal browser, che ha già renderizzato la prima pagina; body = JPEG grezzo.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > 1_000_000) return NextResponse.json({ error: "Anteprima non valida" }, { status: 400 });
  await setAnteprima(pianteId, buf);
  return NextResponse.json({ ok: true });
}
