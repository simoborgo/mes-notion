import { NextRequest, NextResponse } from "next/server";
import { findFornitoreMatch, getFornitoriList, getArticoliFerramenta } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

interface MatchItem {
  idProdotto: string;
  descrizione: string;
  unitaMisura: string;
  fornitoreNomeOs1: string;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  let body: { items?: MatchItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Nessun articolo da importare" }, { status: 400 });
  }

  const [esistenti, fornitoriOptions] = await Promise.all([
    getArticoliFerramenta(),
    getFornitoriList(),
  ]);
  const codiciEsistenti = new Set(esistenti.map(a => a.codiceOs1));

  const results = await Promise.all(items.map(async (item) => {
    const match = item.fornitoreNomeOs1 ? await findFornitoreMatch(item.fornitoreNomeOs1) : null;
    return {
      ...item,
      fornitoreId: match?.id ?? null,
      matchType: match?.matchType ?? "none",
      giaPresente: codiciEsistenti.has(item.idProdotto),
    };
  }));

  return NextResponse.json({ ok: true, items: results, fornitoriOptions });
}
