import { NextRequest, NextResponse } from "next/server";
import { getCostoOrarioManodopera, aggiornaCostoOrarioManodopera } from "@/lib/parametriGeneraliRepository";
import { getSessionFromRequest, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const costoOrarioManodopera = await getCostoOrarioManodopera();
    return NextResponse.json({ costoOrarioManodopera });
  } catch (e) {
    console.error("[admin/parametri-generali GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const valore = Number(body.costoOrarioManodopera);
  if (!(valore >= 0)) {
    return NextResponse.json({ error: "Valore non valido" }, { status: 400 });
  }
  try {
    const costoOrarioManodopera = await aggiornaCostoOrarioManodopera(valore);
    void logOperation(session.name, "UPDATE", "parametri_generali", "costo_orario_manodopera", { valore });
    return NextResponse.json({ costoOrarioManodopera });
  } catch (e) {
    console.error("[admin/parametri-generali PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
