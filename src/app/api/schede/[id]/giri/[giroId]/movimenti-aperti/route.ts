import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getGiroById, getGiroAttivoId } from "@/lib/giriRepository";
import { getMovimentiApertiGiro, chiudiMovimentiGiro } from "@/lib/ritiriRepository";
import { getSessionFromRequest, getOperatoreMatricolaFromRequest, MODIFICA_SCHEDA_ROLES, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { notificaAnomaliaGiro, nomeOperatore } from "@/lib/notificheGiri";
import { getPublicBaseUrl } from "@/lib/url";

type Ctx = { params: Promise<{ id: string; giroId: string }> };
type Azione = "uscita" | "rientro";

const TIPO_PER_AZIONE: Record<Azione, "Consegna" | "Ritiro"> = { uscita: "Consegna", rientro: "Ritiro" };

// Dopo "Segna uscita/rientro" (QR, tab Fornitore Esterno, Lavorazioni Esterne) i movimenti del giro
// in Ritiri e Consegne restano aperti: GET li elenca prima dell'azione, POST chiude quelli confermati.
// Oltre a chi può muovere il giro dalla scheda (MODIFICA_SCHEDA_ROLES) o gestire Ritiri (WRITE_ROLES),
// basta il token operatore del PIN, come per l'uscita/rientro da QR: è la conseguenza di quell'azione,
// non un cambio di stato libero in Ritiri e Consegne (che resta ad admin e logistica).
interface Autore { log: string; nome: string; logistica: boolean }
async function autorizza(req: NextRequest): Promise<Autore | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  if (MODIFICA_SCHEDA_ROLES.includes(session.role) || WRITE_ROLES.includes(session.role)) {
    return { log: session.name, nome: session.name, logistica: session.role === "logistica" };
  }
  const matricola = await getOperatoreMatricolaFromRequest(req);
  if (!matricola) return null;
  return { log: `${session.name} (matricola ${matricola})`, nome: await nomeOperatore(matricola), logistica: false };
}

// `giroId = "attivo"`: Lavorazioni Esterne lavora sulla scheda e non conosce il giro, si usa quello
// ancora aperto. Altrimenti il giro deve appartenere alla scheda dell'URL.
async function risolviGiro(schedaId: string, giroId: string): Promise<string | null> {
  if (giroId === "attivo") return getGiroAttivoId(schedaId, true);
  const giro = await getGiroById(giroId).catch(() => null);
  return giro && giro.schedaId === schedaId ? giro.id : null;
}

function leggiAzione(v: unknown): Azione | null {
  return v === "uscita" || v === "rientro" ? v : null;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await autorizza(req))) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  const azione = leggiAzione(req.nextUrl.searchParams.get("azione"));
  if (!azione) return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  try {
    const { id, giroId } = await params;
    const giro = await risolviGiro(id, giroId);
    if (!giro) return NextResponse.json({ giroId: null, movimenti: [] });
    const movimenti = await getMovimentiApertiGiro(giro, TIPO_PER_AZIONE[azione]);
    return NextResponse.json({
      giroId: giro,
      movimenti: movimenti.map((m) => ({ id: m.id, descrizione: m.causale, tipoMovimento: m.tipoMovimento, dataTrasporto: m.dataTrasporto, stato: m.stato })),
    });
  } catch (e) {
    console.error("[GET movimenti-aperti]", e);
    return NextResponse.json({ error: "Errore lettura movimenti" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const autore = await autorizza(req);
  if (!autore) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  let body: { azione?: unknown; ids?: unknown; verifica?: unknown; origine?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const azione = leggiAzione(body.azione);
  if (!azione) return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  const { id, giroId } = await params;

  // `verifica`: dopo l'uscita/rientro l'utente non ha chiuso nulla (nessun movimento, o "Lascia
  // aperti"). Il server ricontrolla dal DB e, se i movimenti non tornano, avvisa la Logistica, a
  // meno che a segnare non sia stata la logistica stessa.
  if (body.verifica === true) {
    try {
      const giro = await risolviGiro(id, giroId);
      if (!giro) return NextResponse.json({ error: "Giro non trovato" }, { status: 404 });
      if (autore.logistica) return NextResponse.json({ caso: "ok", notificata: false });
      const origine = typeof body.origine === "string" && body.origine ? body.origine.slice(0, 40) : "Scheda";
      const { caso, esito } = await notificaAnomaliaGiro(giro, azione, { autore: autore.nome, origine, baseUrl: getPublicBaseUrl(req) });
      return NextResponse.json({ caso, notificata: !!esito?.sent });
    } catch (e) {
      console.error("[POST movimenti-aperti verifica]", e);
      return NextResponse.json({ error: "Errore verifica movimenti" }, { status: 500 });
    }
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  try {
    const giro = await risolviGiro(id, giroId);
    if (!giro) return NextResponse.json({ error: "Giro non trovato" }, { status: 404 });
    const chiusi = await chiudiMovimentiGiro(giro, ids);
    for (const ritiroId of chiusi) {
      void logOperation(autore.log, "UPDATE", "ritiro", ritiroId, { stato: "Fatto", origine: `giro_${azione}` });
    }
    revalidatePath("/ritiri");
    return NextResponse.json({ chiusi });
  } catch (e) {
    console.error("[POST movimenti-aperti]", e);
    return NextResponse.json({ error: "Errore chiusura movimenti" }, { status: 500 });
  }
}
