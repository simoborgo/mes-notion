// Lato client della conferma "chiudi i movimenti del giro" dopo Segna uscita/rientro (QR, tab
// Fornitore Esterno, Lavorazioni Esterne). Vedi /api/schede/[id]/giri/[giroId]/movimenti-aperti.

export type AzioneGiro = "uscita" | "rientro";

export interface MovimentoAperto {
  id: string;
  descrizione: string;
  tipoMovimento: string;
  dataTrasporto: string | null;
  stato: string;
}

export interface MovimentiAperti {
  giroId: string | null;
  movimenti: MovimentoAperto[];
}

const url = (schedaId: string, giroId: string) => `/api/schede/${schedaId}/giri/${giroId}/movimenti-aperti`;

// Da chiamare PRIMA dell'azione: dopo un rientro il giro "attivo" può non essere più lo stesso.
// `giroId = "attivo"` per chi lavora sulla scheda senza conoscere il giro. Un errore non deve
// bloccare l'uscita/rientro: in quel caso semplicemente non si propone nulla.
export async function leggiMovimentiAperti(schedaId: string, giroId: string, azione: AzioneGiro, token?: string): Promise<MovimentiAperti> {
  try {
    const res = await fetch(`${url(schedaId, giroId)}?azione=${azione}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return { giroId: null, movimenti: [] };
    return (await res.json()) as MovimentiAperti;
  } catch {
    return { giroId: null, movimenti: [] };
  }
}

function dataBreve(d: string | null): string {
  if (!d) return "senza data";
  const [y, m, g] = d.slice(0, 10).split("-");
  return y && m && g ? `${g}/${m}` : d;
}

export function rigaMovimento(m: MovimentoAperto): string {
  return `${dataBreve(m.dataTrasporto)} · ${m.descrizione || m.tipoMovimento}`;
}

export function titoloConferma(azione: AzioneGiro, n: number): string {
  if (azione === "uscita") {
    return n === 1
      ? "In Ritiri e Consegne c'è 1 Consegna ancora aperta per questo giro"
      : `In Ritiri e Consegne ci sono ${n} Consegne ancora aperte per questo giro`;
  }
  return n === 1
    ? "In Ritiri e Consegne c'è 1 Ritiro ancora aperto per questo giro"
    : `In Ritiri e Consegne ci sono ${n} Ritiri ancora aperti per questo giro`;
}

// Testo completo per window.confirm (tab Fornitore Esterno, Lavorazioni Esterne).
export function testoConferma(azione: AzioneGiro, movimenti: MovimentoAperto[]): string {
  const n = movimenti.length;
  const elenco = movimenti.map((m) => `• ${rigaMovimento(m)}`).join("\n");
  return `${titoloConferma(azione, n)}:\n\n${elenco}\n\n${n === 1 ? "Segnarlo Fatto?" : "Segnarli tutti Fatto?"}`;
}

// Dopo un'uscita/rientro in cui non si è chiuso nulla (nessun movimento, o "Lascia aperti"): il server
// ricontrolla e, se Ritiri e Consegne non torna, avvisa la Logistica. Mai bloccante per l'utente.
export async function segnalaVerifica(schedaId: string, giroId: string, azione: AzioneGiro, origine: string, token?: string): Promise<void> {
  try {
    await fetch(url(schedaId, giroId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ azione, verifica: true, origine }),
    });
  } catch {
    // la notifica non deve mai fermare l'uscita/rientro
  }
}

export async function chiudiMovimenti(schedaId: string, giroId: string, azione: AzioneGiro, ids: string[], token?: string): Promise<number> {
  const res = await fetch(url(schedaId, giroId), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ azione, ids }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? "Chiusura dei movimenti non riuscita");
  return Array.isArray(out.chiusi) ? out.chiusi.length : 0;
}
