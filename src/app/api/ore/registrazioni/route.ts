import { NextRequest, NextResponse } from "next/server";
import { upsertRegistrazione, type OreCausale } from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

interface VoceInput {
  data: string;
  matricola: string;
  cognome: string;
  nome: string;
  azienda: string | null;
  reparto: string | null;
  odp: string;
  ore: number;
  rif?: boolean;
  causale?: OreCausale | null;
  note?: string | null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  let body: { voci?: VoceInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const voci = Array.isArray(body.voci) ? body.voci : [];
  if (voci.length === 0) {
    return NextResponse.json({ error: "Nessuna voce da registrare" }, { status: 400 });
  }
  for (const v of voci) {
    if (!v.data || !v.matricola || !v.odp || !(v.ore > 0)) {
      return NextResponse.json({ error: "Voce non valida: data, matricola, odp e ore sono obbligatori" }, { status: 400 });
    }
  }

  try {
    const risultati = await Promise.all(voci.map(v => upsertRegistrazione({
      data: v.data,
      matricola: v.matricola,
      cognome: v.cognome,
      nome: v.nome,
      azienda: v.azienda ?? null,
      reparto: v.reparto ?? null,
      odp: v.odp,
      ore: v.ore,
      rif: v.rif ?? false,
      causale: v.causale ?? null,
      note: v.note ?? null,
    })));

    void logOperation(
      session.name, "CREATE", "ore_registrate",
      voci.map(v => `${v.matricola}:${v.odp}`).join(","),
      { count: voci.length, data: voci[0]?.data }
    );

    return NextResponse.json({ ok: true, registrazioni: risultati });
  } catch (e) {
    console.error("[ore/registrazioni POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
