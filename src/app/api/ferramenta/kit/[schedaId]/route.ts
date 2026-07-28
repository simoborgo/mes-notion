import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { updateSchedaKitFerramenta } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { schedaId } = await params;
  let body: { stato?: "Si" | "No" | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (body.stato !== "Si" && body.stato !== "No" && body.stato !== null) {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
  }

  const updated = await updateSchedaKitFerramenta(schedaId, body.stato ?? null);
  void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { stato: body.stato });
  revalidatePath("/admin/ferramenta/kit");
  revalidatePath("/ferramenta/fogli-scarico");
  revalidateTag("schede", "default");
  return NextResponse.json(updated);
}
