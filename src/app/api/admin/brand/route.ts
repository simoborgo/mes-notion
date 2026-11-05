import { NextRequest, NextResponse } from "next/server";
import { getBrand, createBrand } from "@/lib/brandRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { COMMESSE_ROLES, IMPOSTAZIONI_ROLES } from "@/lib/roles";
import { logOperation } from "@/lib/audit";

// Elenco leggibile da chi gestisce le commesse (selettore nel form); scritture solo admin.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    return NextResponse.json(await getBrand());
  } catch (e) {
    console.error("[admin/brand GET]", e);
    return NextResponse.json({ error: "Errore lettura brand" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  const alias = typeof body.alias === "string" ? body.alias.trim() : "";
  try {
    const brand = await createBrand({ nome, alias });
    void logOperation(session.name, "CREATE", "brand", brand.id, { nome, alias });
    return NextResponse.json(brand);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Esiste già un brand con questo nome" }, { status: 409 });
    }
    console.error("[admin/brand POST]", e);
    return NextResponse.json({ error: "Errore creazione brand" }, { status: 500 });
  }
}
