import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { spostaOdp, SpostamentoNonValidoError } from "@/lib/carichiRepository";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sposta ODP/sottoschede in un carico (caricoId) o li toglie da ogni carico (caricoId: null).
// Usata dalla pagina Carichi (barra "Sposta in").
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    const odpIds: unknown = body?.odpIds;
    const caricoId: unknown = body?.caricoId ?? null;
    if (!Array.isArray(odpIds) || odpIds.length === 0 || !odpIds.every((x) => typeof x === "string" && UUID.test(x))) {
      return NextResponse.json({ error: "Seleziona almeno un ODP." }, { status: 400 });
    }
    if (caricoId !== null && !(typeof caricoId === "string" && UUID.test(caricoId))) {
      return NextResponse.json({ error: "Carico di destinazione non valido." }, { status: 400 });
    }

    const esito = await spostaOdp(odpIds as string[], caricoId as string | null);

    void logOperation(session.name, "UPDATE", "carico", (caricoId as string | null) ?? "nessun-carico", { azione: "sposta-odp", odpIds, caricoId });

    revalidatePath("/carichi");
    revalidatePath("/schede");
    revalidatePath("/commesse");

    return NextResponse.json(esito);
  } catch (e) {
    if (e instanceof SpostamentoNonValidoError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[POST /api/carichi/sposta]", e);
    return NextResponse.json({ error: "Errore durante lo spostamento. Riprova." }, { status: 500 });
  }
}
