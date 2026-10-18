import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/operatoriRepository";
import { trovaMatricolaDaPin } from "@/lib/operatoriPinRepository";
import { getSessionFromRequest, signOperatoreToken } from "@/lib/auth";

// Accesso con il solo PIN (arrivo da QR scansionato): non c'è una matricola a cui limitare i
// tentativi, quindi il freno è per dispositivo (IP) più un tetto globale — con 4 cifre lo spazio
// è di 10.000 PIN e senza freno un tablet loggato permetterebbe di provarli tutti.
// In-memory come verifica-pin: processo Node persistente (Docker su VPS), si azzera al riavvio.
const MAX_FALLITI_PER_IP = 5;
const MAX_FALLITI_GLOBALI = 20;
const FINESTRA_MS = 60_000;
const perIp = new Map<string, { count: number; resetAt: number }>();
const globale = { count: 0, resetAt: 0 };

function bloccato(ip: string): boolean {
  const now = Date.now();
  if (now > globale.resetAt) globale.count = 0;
  const t = perIp.get(ip);
  const fallitiIp = t && now <= t.resetAt ? t.count : 0;
  return fallitiIp >= MAX_FALLITI_PER_IP || globale.count >= MAX_FALLITI_GLOBALI;
}

function registraFallito(ip: string) {
  const now = Date.now();
  const t = perIp.get(ip);
  if (!t || now > t.resetAt) perIp.set(ip, { count: 1, resetAt: now + FINESTRA_MS });
  else t.count += 1;
  if (now > globale.resetAt) { globale.count = 0; globale.resetAt = now + FINESTRA_MS; }
  globale.count += 1;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const pin = String(body?.pin ?? "");
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "Il PIN deve essere di 4 cifre" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "sconosciuto";
  if (bloccato(ip)) return NextResponse.json({ error: "Troppi tentativi, riprova tra un minuto" }, { status: 429 });

  try {
    const matricola = await trovaMatricolaDaPin(pin);
    if (!matricola) {
      registraFallito(ip);
      return NextResponse.json({ error: "PIN non riconosciuto" }, { status: 401 });
    }
    const operatori = await getOperatori();
    const op = operatori.find(o => o.matricola === matricola);
    if (!op) return NextResponse.json({ error: "Operatore non trovato o non più in forza" }, { status: 404 });
    perIp.delete(ip);
    const token = await signOperatoreToken(op.matricola);
    return NextResponse.json({ ok: true, token, matricola: op.matricola, cognome: op.cognome, nome: op.nome, reparto: op.reparto, azienda: op.azienda });
  } catch (e) {
    console.error("[ore/operatore/verifica-pin-solo]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
