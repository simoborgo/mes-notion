import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRitiri, createRitiro, getRitiroById, appendFotoToPage } from "@/lib/notion";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET() {
  try {
    const ritiri = await getRitiri();
    return NextResponse.json(ritiri);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero ritiri" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();
    const { causale, tipoMovimento, dataTrasporto, urgenza, schedaId, fornitoreId, foto_base64 } = body;
    if (!causale?.trim()) {
      return NextResponse.json({ error: "Descrizione obbligatoria" }, { status: 400 });
    }
    const ritiro = await createRitiro({
      causale: causale.trim(),
      tipoMovimento,
      dataTrasporto: dataTrasporto || null,
      urgenza: urgenza ?? false,
      schedaId: schedaId || null,
      fornitoreId: fornitoreId || null,
    });

    const fotoArray: string[] = Array.isArray(foto_base64) ? foto_base64 : foto_base64 ? [foto_base64] : [];
    let ritiroFinale = ritiro;
    if (fotoArray.length) {
      try {
        await appendFotoToPage(ritiro.id, fotoArray);
        // Rilegge la pagina per ottenere le URL firmate delle foto appena caricate
        ritiroFinale = await getRitiroById(ritiro.id);
      } catch (e) {
        console.error("[ritiri POST] appendFoto:", e);
        // Upload foto fallito: ritorna comunque il ritiro (senza foto)
      }
    }

    void logOperation(
      session?.name ?? "Sconosciuto",
      "CREATE",
      "ritiro",
      ritiro.id,
      { causale: causale.trim(), tipoMovimento, dataTrasporto, urgenza, schedaId, fornitoreId }
    );

    revalidatePath("/ritiri");
    return NextResponse.json(ritiroFinale, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione ritiro" }, { status: 500 });
  }
}
