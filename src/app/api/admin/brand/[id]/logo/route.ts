import { NextRequest, NextResponse } from "next/server";
import { getLogoBrand, setLogoBrand } from "@/lib/brandRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { IMPOSTAZIONI_ROLES } from "@/lib/roles";
import { logOperation } from "@/lib/audit";

const MAX_BYTES = 500 * 1024;
const MIME_AMMESSI = ["image/png", "image/jpeg", "image/svg+xml"];

// Immagine del logo per l'anteprima a video (richiede la sessione, come il resto dell'app).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await params;
  const l = await getLogoBrand(id);
  if (!l) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(l.logo), {
    headers: {
      "Content-Type": l.mime,
      "Cache-Control": "private, max-age=300",
      // Un SVG aperto direttamente non deve poter eseguire script.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File mancante" }, { status: 400 });
  if (!MIME_AMMESSI.includes(file.type)) {
    return NextResponse.json({ error: "Formato non supportato: usa PNG, JPG o SVG" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo troppo pesante (max 500 KB)" }, { status: 400 });
  }
  try {
    const ok = await setLogoBrand(id, Buffer.from(await file.arrayBuffer()), file.type);
    if (!ok) return NextResponse.json({ error: "Brand non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "brand", id, { logo: file.name, bytes: file.size });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/brand logo PUT]", e);
    return NextResponse.json({ error: "Errore salvataggio logo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    if (!(await setLogoBrand(id, null, null))) return NextResponse.json({ error: "Brand non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "brand", id, { logo: null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/brand logo DELETE]", e);
    return NextResponse.json({ error: "Errore rimozione logo" }, { status: 500 });
  }
}
