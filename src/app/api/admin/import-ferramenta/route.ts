import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createArticoloFerramenta } from "@/lib/articoliFerramentaRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

interface ImportItem {
  idProdotto: string;
  descrizione: string;
  unitaMisura: string;
  fornitoreId: string | null;
  fornitoreNomeOs1: string;
  codiceFornitore: string;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  let body: { items?: ImportItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Nessun articolo da importare" }, { status: 400 });
  }

  const created: string[] = [];
  const errors: { idProdotto: string; error: string }[] = [];

  // In sequenza (non Promise.all) per rispettare il rate limit Notion —
  // stesso pattern del loop sottoschede in import-scheda/route.ts.
  for (const item of items) {
    try {
      const articolo = await createArticoloFerramenta({
        descrizione: item.descrizione,
        codiceOs1: item.idProdotto,
        unitaMisura: item.unitaMisura,
        fornitoreId: item.fornitoreId,
        fornitoreNomeOs1: item.fornitoreNomeOs1,
        codiceFornitore: item.codiceFornitore,
      });
      created.push(articolo.id);
    } catch (e) {
      errors.push({ idProdotto: item.idProdotto, error: e instanceof Error ? e.message : String(e) });
    }
  }

  void logOperation(session.name, "CREATE", "articolo_ferramenta", "import-csv", { created: created.length, errors: errors.length });

  revalidatePath("/ferramenta");
  revalidatePath("/admin/ferramenta");

  return NextResponse.json({ ok: true, created: created.length, errors });
}
