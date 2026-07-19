import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { appendFotoToPage } from "@/lib/notion";
import { logOperation } from "@/lib/audit";

const MAX_BASE64_CHARS = 14 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !WRITE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;
  let fotoArray: string[];
  try {
    const body = await req.json();
    const raw = body.foto_base64;
    fotoArray = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (!fotoArray.length) throw new Error("foto_base64 mancante");
    for (const f of fotoArray) {
      if (typeof f !== "string" || f.length > MAX_BASE64_CHARS)
        throw new Error("Foto troppo grande (max 10 MB)");
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Payload non valido" }, { status: 400 });
  }
  try {
    await appendFotoToPage(id, fotoArray);
    void logOperation(session.name, "UPLOAD_FOTO", "ritiro", id, { count: fotoArray.length });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/ritiri/[id]/foto]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
