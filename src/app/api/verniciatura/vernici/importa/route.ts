import { NextRequest, NextResponse } from "next/server";
import { estraiRigheDalCsv, anteprimaImportVernici, eseguiImportVernici } from "@/lib/verniciImportRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Import da UI dell'estratto CSV OS1 (stessa logica di scripts/importa-vernici.mjs). Sempre in due
// passi: senza "conferma" nel form-data ritorna solo l'anteprima (nessuna scrittura); con
// conferma="true" scrive davvero — mai un import diretto senza che il chiamante abbia prima visto
// cosa cambierebbe.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get("csv") as File | null;
    if (!file) return NextResponse.json({ error: 'File CSV mancante nel campo "csv"' }, { status: 400 });
    const conferma = form.get("conferma") === "true";

    const testo = await file.text();
    const righe = estraiRigheDalCsv(testo);

    if (!conferma) {
      const anteprima = await anteprimaImportVernici(righe);
      return NextResponse.json({ anteprima });
    }

    const risultato = await eseguiImportVernici(righe);
    void logOperation(session.name, "UPDATE", "vernice", "import-csv", { azione: "importa_da_os1", ...risultato });
    return NextResponse.json({ risultato });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[verniciatura/vernici/importa]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
