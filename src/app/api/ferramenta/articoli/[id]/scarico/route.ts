import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoloFerramentaById, updateArticoloFerramentaGiacenza } from "@/lib/articoliFerramentaRepository";
import { registraMovimento } from "@/lib/ferramentaRepository";
import { sendNotifica } from "@/lib/notify";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* body opzionale per Kanban */ }

  const articolo = await getArticoloFerramentaById(id);
  if (!articolo.attivo) {
    return NextResponse.json({ error: "Articolo non attivo" }, { status: 400 });
  }
  if (!articolo.metodoGestione) {
    return NextResponse.json({ error: "Articolo non ancora classificato" }, { status: 400 });
  }

  let quantita: number;
  let tipo: "scarico_kanban" | "scarico_a_pezzo";
  if (articolo.metodoGestione === "Kanban") {
    if (!articolo.quantitaStandardVaschetta || articolo.quantitaStandardVaschetta <= 0) {
      return NextResponse.json({ error: "Quantità Standard Vaschetta non configurata" }, { status: 400 });
    }
    quantita = articolo.quantitaStandardVaschetta;
    tipo = "scarico_kanban";
  } else {
    const q = Number(body.quantita);
    if (!q || q <= 0) {
      return NextResponse.json({ error: "Quantità mancante o non valida" }, { status: 400 });
    }
    quantita = q;
    tipo = "scarico_a_pezzo";
  }

  const giacenzaPrecedente = articolo.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente - quantita;

  await updateArticoloFerramentaGiacenza(id, giacenzaRisultante);

  const odpId = typeof body.odpId === "string" && body.odpId ? body.odpId : null;
  const odpLabel = typeof body.odpLabel === "string" && body.odpLabel ? body.odpLabel : null;

  const movimento = await registraMovimento({
    articoloId: id,
    codiceOs1: articolo.codiceOs1 || null,
    tipo,
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    fonte: "mes",
    odpId,
    odpLabel,
  });

  const warnings: string[] = [];
  const sogliaMinima = articolo.sogliaMinima;
  const sottoSoglia = sogliaMinima != null && giacenzaPrecedente >= sogliaMinima && giacenzaRisultante < sogliaMinima;
  if (sottoSoglia) {
    const result = await sendNotifica({
      entityType: "articolo_ferramenta",
      entityId: id,
      eventType: "sotto_soglia",
      eventId: movimento.id,
      webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
      payload: {
        articolo_id: id,
        codice_os1: articolo.codiceOs1,
        descrizione: articolo.descrizione,
        giacenza_attuale: giacenzaRisultante,
        soglia_minima: sogliaMinima,
      },
    });
    if (result.warning) warnings.push(result.warning);
  }

  void logOperation(session.name, "UPDATE", "articolo_ferramenta", id, { tipo, quantita, giacenzaRisultante, odpId });

  revalidatePath("/ferramenta");
  revalidatePath("/admin/ferramenta");

  if (warnings.length > 0) {
    return NextResponse.json({ ok: true, giacenzaRisultante, sottoSoglia, warnings }, { status: 207 });
  }
  return NextResponse.json({ ok: true, giacenzaRisultante, sottoSoglia });
}
