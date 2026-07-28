import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateArticoloFerramentaClassificazione } from "@/lib/articoliFerramentaRepository";
import type { ArticoloFerramentaUpdate } from "@/lib/types";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: ArticoloFerramentaUpdate;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  if (body.metodoGestione !== undefined && body.metodoGestione !== null) {
    if (body.metodoGestione !== "Kanban" && body.metodoGestione !== "A Pezzo") {
      return NextResponse.json({ error: "Metodo Gestione non valido" }, { status: 400 });
    }
    if (body.metodoGestione === "Kanban" && !(Number(body.quantitaStandardVaschetta) > 0)) {
      return NextResponse.json({ error: "Quantità Standard Vaschetta obbligatoria (> 0) per articoli Kanban" }, { status: 400 });
    }
  }
  if (body.sogliaMinima !== undefined && body.sogliaMinima !== null && Number(body.sogliaMinima) < 0) {
    return NextResponse.json({ error: "Soglia Minima non può essere negativa" }, { status: 400 });
  }

  try {
    const updated = await updateArticoloFerramentaClassificazione(id, body);
    void logOperation(session.name, "UPDATE", "articolo_ferramenta", id, body as Record<string, unknown>);
    revalidatePath("/ferramenta");
    revalidatePath("/admin/ferramenta");
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
