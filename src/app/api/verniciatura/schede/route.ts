import { NextRequest, NextResponse } from "next/server";
import { getSchede, createScheda } from "@/lib/schedeVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import type { StatoSchedaVerniciatura } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const schede = await getSchede({
      soloAttive: sp.get("includeInattive") !== "true",
      stato: (sp.get("stato") as StatoSchedaVerniciatura | null) ?? undefined,
      nome: sp.get("nome") ?? undefined,
      cliente: sp.get("cliente") ?? undefined,
      codicePubblico: sp.get("codicePubblico") ?? undefined,
    });
    return NextResponse.json(schede);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero schede" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    if (!body.cliente) {
      return NextResponse.json({ error: "Cliente obbligatorio" }, { status: 400 });
    }
    const fasi = Array.isArray(body.fasi) ? body.fasi : [];
    if (fasi.length === 0) {
      return NextResponse.json({ error: "La scheda deve avere almeno una fase" }, { status: 400 });
    }
    for (const f of fasi) {
      if (typeof f.ordine !== "number") {
        return NextResponse.json({ error: "Ogni fase richiede un ordine numerico" }, { status: 400 });
      }
      const prodotti = Array.isArray(f.prodotti) ? f.prodotti : [];
      if (!prodotti.some((p: { ruoloInFase?: string }) => p.ruoloInFase === "vernice")) {
        return NextResponse.json({ error: `La fase con ordine ${f.ordine} non ha una vernice principale` }, { status: 400 });
      }
      for (const p of prodotti) {
        if (!p.verniceId || !p.ruoloInFase) {
          return NextResponse.json({ error: "Ogni prodotto richiede verniceId e ruoloInFase" }, { status: 400 });
        }
      }
    }

    const scheda = await createScheda({
      nome: body.nome ?? null,
      note: body.note ?? null,
      essenza: body.essenza ?? null,
      ignifuga: body.ignifuga ?? null,
      cliente: String(body.cliente),
      commessaId: body.commessaId ?? null,
      codiceCampioneMaterialista: body.codiceCampioneMaterialista ?? null,
      dataProva: body.dataProva ?? null,
      forzaNuovoBarcode: body.forzaNuovoBarcode === true,
      fasi: fasi.map((f: { ordine: number; nomeFase?: string; note?: string; prodotti: { verniceId: string; ruoloInFase: string; quantita?: number; unita?: string; note?: string }[] }) => ({
        ordine: f.ordine,
        nomeFase: f.nomeFase ?? null,
        note: f.note ?? null,
        prodotti: f.prodotti.map((p) => ({
          verniceId: p.verniceId,
          ruoloInFase: p.ruoloInFase,
          quantita: p.quantita ?? null,
          unita: p.unita ?? null,
          note: p.note ?? null,
        })),
      })),
    });

    void logOperation(session.name, "CREATE", "scheda_verniciatura", scheda.id, { nome: body.nome, cliente: body.cliente, fasi: fasi.length });
    return NextResponse.json(scheda, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
