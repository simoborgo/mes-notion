import { NextRequest, NextResponse } from "next/server";
import { getOrariTurno, aggiornaOrariTurno, OrariTurno } from "@/lib/parametriGeneraliRepository";
import { getSessionFromRequest, ORARI_TURNO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const ORARIO_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validaOrariTurno(body: Record<string, unknown>): OrariTurno | null {
  const campi: (keyof OrariTurno)[] = [
    "turnoFerialeInizio", "turnoFerialeFine", "turnoFerialePausaInizio", "turnoFerialePausaFine",
    "turnoSabatoInizio", "turnoSabatoFine",
  ];
  const valori = {} as OrariTurno;
  for (const campo of campi) {
    const v = body[campo];
    if (typeof v !== "string" || !ORARIO_RE.test(v)) return null;
    valori[campo] = v;
  }
  const { turnoFerialeInizio, turnoFerialeFine, turnoFerialePausaInizio, turnoFerialePausaFine, turnoSabatoInizio, turnoSabatoFine } = valori;
  if (!(turnoFerialeInizio < turnoFerialePausaInizio && turnoFerialePausaInizio < turnoFerialePausaFine && turnoFerialePausaFine < turnoFerialeFine)) return null;
  if (!(turnoSabatoInizio < turnoSabatoFine)) return null;
  return valori;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !ORARI_TURNO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const orari = await getOrariTurno();
    return NextResponse.json(orari);
  } catch (e) {
    console.error("[admin/orari-turno GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !ORARI_TURNO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const valori = validaOrariTurno(body);
  if (!valori) {
    return NextResponse.json({ error: "Orari non validi (formato HH:MM, inizio < pausa < fine)" }, { status: 400 });
  }
  try {
    const orari = await aggiornaOrariTurno(valori);
    void logOperation(session.name, "UPDATE", "parametri_generali", "orari_turno", { ...valori });
    return NextResponse.json(orari);
  } catch (e) {
    console.error("[admin/orari-turno PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
