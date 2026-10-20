import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSchedaById, updateScheda, archiveScheda } from "@/lib/schedeRepository";
import type { SchedaUpdate } from "@/lib/types";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { setValoreVendita } from "@/lib/schedeEconomiaRepository";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scheda = await getSchedaById(id);
    return NextResponse.json(scheda);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body: SchedaUpdate = await req.json();

    // ODP e titolo (numero scheda) li cambia solo l'admin. I moduli inviano sempre tutti i campi,
    // quindi si rifiuta solo se il valore è davvero diverso da quello salvato.
    if (session.role !== "admin" && (body.odp !== undefined || body.numeroScheda !== undefined)) {
      const attuale = await getSchedaById(id);
      const odpCambiato = body.odp !== undefined && body.odp.trim() !== (attuale.odp ?? "");
      const titoloCambiato = body.numeroScheda !== undefined && body.numeroScheda.trim() !== (attuale.numeroScheda ?? "");
      if (odpCambiato || titoloCambiato) {
        return NextResponse.json({ error: "Solo l'admin può modificare ODP e titolo della scheda" }, { status: 403 });
      }
    }

    // Il valore di vendita lo scrive solo l'admin e non passa da updateScheda (non fa parte dell'oggetto Scheda).
    const { valoreVendita, ...datiScheda } = body;
    if (valoreVendita !== undefined) {
      if (session.role !== "admin") return NextResponse.json({ error: "Solo l'admin può modificare il valore di vendita" }, { status: 403 });
      if (valoreVendita !== null && !(Number.isFinite(valoreVendita) && valoreVendita >= 0)) {
        return NextResponse.json({ error: "Valore di vendita non valido" }, { status: 400 });
      }
    }
    const ore = datiScheda.oreManodoperaPreviste;
    if (ore != null && !(Number.isFinite(ore) && ore >= 0)) {
      return NextResponse.json({ error: "Ore manodopera non valide" }, { status: 400 });
    }

    const updated = await updateScheda(id, datiScheda);
    if (valoreVendita !== undefined) await setValoreVendita(id, valoreVendita);

    revalidatePath("/schede");

    void logOperation(
      session?.name ?? "Sconosciuto",
      "UPDATE",
      "scheda",
      id,
      body as Record<string, unknown>
    );

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento scheda" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }

    await archiveScheda(id);

    revalidatePath("/schede");

    void logOperation(session.name, "DELETE", "scheda", id, {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione scheda" }, { status: 500 });
  }
}
