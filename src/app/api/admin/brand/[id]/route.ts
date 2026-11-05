import { NextRequest, NextResponse } from "next/server";
import { updateBrand, deleteBrand } from "@/lib/brandRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { IMPOSTAZIONI_ROLES } from "@/lib/roles";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  const alias = typeof body.alias === "string" ? body.alias.trim() : "";
  try {
    const brand = await updateBrand(id, { nome, alias });
    if (!brand) return NextResponse.json({ error: "Brand non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "brand", id, { nome, alias });
    return NextResponse.json(brand);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Esiste già un brand con questo nome" }, { status: 409 });
    }
    console.error("[admin/brand PATCH]", e);
    return NextResponse.json({ error: "Errore aggiornamento brand" }, { status: 500 });
  }
}

// Le commesse collegate restano, con brand_id azzerato (ON DELETE SET NULL).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    if (!(await deleteBrand(id))) return NextResponse.json({ error: "Brand non trovato" }, { status: 404 });
    void logOperation(session.name, "DELETE", "brand", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/brand DELETE]", e);
    return NextResponse.json({ error: "Errore eliminazione brand" }, { status: 500 });
  }
}
