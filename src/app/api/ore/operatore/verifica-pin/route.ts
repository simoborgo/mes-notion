import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/operatoriRepository";
import { verificaPin } from "@/lib/operatoriPinRepository";
import { getSessionFromRequest, signOperatoreToken } from "@/lib/auth";

const MAX_TENTATIVI = 5;
const FINESTRA_MS = 60_000;
// In-memory: sufficiente per un processo Node persistente (deploy Docker su VPS, non serverless).
// Si azzera al riavvio del processo — accettabile per un tablet interno, non un endpoint esposto.
const tentativi = new Map<string, { count: number; resetAt: number }>();

function bloccato(matricola: string): boolean {
  const t = tentativi.get(matricola);
  if (!t) return false;
  if (Date.now() > t.resetAt) { tentativi.delete(matricola); return false; }
  return t.count >= MAX_TENTATIVI;
}

function registraTentativoFallito(matricola: string) {
  const t = tentativi.get(matricola);
  if (!t || Date.now() > t.resetAt) {
    tentativi.set(matricola, { count: 1, resetAt: Date.now() + FINESTRA_MS });
  } else {
    t.count += 1;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { matricola, pin } = body;
  if (!matricola || !pin) {
    return NextResponse.json({ error: "matricola e pin sono obbligatori" }, { status: 400 });
  }

  if (bloccato(matricola)) {
    return NextResponse.json({ error: "Troppi tentativi, riprova tra un minuto" }, { status: 429 });
  }

  try {
    const ok = await verificaPin(matricola, String(pin));
    if (!ok) {
      registraTentativoFallito(matricola);
      return NextResponse.json({ error: "PIN errato" }, { status: 401 });
    }
    tentativi.delete(matricola);
    const operatori = await getOperatori();
    const op = operatori.find(o => o.matricola === matricola);
    if (!op) return NextResponse.json({ error: "Operatore non trovato o non più in forza" }, { status: 404 });
    const token = await signOperatoreToken(op.matricola);
    return NextResponse.json({ ok: true, token, matricola: op.matricola, cognome: op.cognome, nome: op.nome, reparto: op.reparto, azienda: op.azienda });
  } catch (e) {
    console.error("[ore/operatore/verifica-pin]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
