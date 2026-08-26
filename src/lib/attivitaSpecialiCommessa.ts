// Attività ricorrenti trasversali a tutta la commessa (non un singolo ODP/Scheda), tracciate
// come pseudo-ODP — stesso principio di ODP_SPECIALI sotto ma parametrico sulla commessa invece
// che fisso a livello stabilimento. Nessuna tabella, nessuna creazione: esistono per ogni
// commessa non chiusa, per tutta la sua vita (spariscono da soli alla chiusura commessa), usate
// sia da Rilevamento Ore sia da Ferramenta. Elenco fisso e volutamente hardcoded qui (deciso con
// l'utente 2026-08-12): un cambio è una decisione di prodotto, non un parametro d'ambiente, quindi
// niente .env — si estende questo array e basta.
export const ATTIVITA_SPECIALI_COMMESSA = [
  { suffix: "CABLAGGIO", label: "Cablaggio generale" },
  { suffix: "FERRAMENTA", label: "Ferramenta" },
  { suffix: "GESTIONE", label: "Gestione Commessa" },
  { suffix: "SEMILAVORATI", label: "Preparazione Semilavorati" },
  { suffix: "CAMPIONATURA", label: "Campionatura" },
  { suffix: "VERNICIATURA", label: "Verniciatura" },
] as const;

// Codici speciali fissi a livello stabilimento (non legati a nessuna commessa) — usati da
// getOdpAttivi() per popolare l'autocomplete di Rilevamento Ore e dal prefix-matching di
// categoriaFromOdp() in oreRepository.ts. Nessun modulo server-only qui dentro: importabile
// sia da codice server (schedeRepository.ts) sia da componenti client (VistaOggi.tsx).
export const ODP_SPECIALI = [
  { prefix: "SET", label: "Setup" },
  { prefix: "MNT", label: "Manutenzione" },
  { prefix: "MEET", label: "Riunione" },
  { prefix: "FORM", label: "Formazione" },
  { prefix: "PUL", label: "Pulizie" },
  { prefix: "FERMO", label: "Fermo Macchina" },
] as const;

export type AttivitaSpecialeSuffix = (typeof ATTIVITA_SPECIALI_COMMESSA)[number]["suffix"];

export function codiceAttivitaSpecialeCommessa(numeroCommessa: string, suffix: AttivitaSpecialeSuffix): string {
  return `${numeroCommessa}-${suffix}`;
}

export function codiciSpecialiPerCommessa(numeroCommessa: string, cliente?: string | null): { odp: string; label: string }[] {
  return ATTIVITA_SPECIALI_COMMESSA.map((a) => {
    const odp = codiceAttivitaSpecialeCommessa(numeroCommessa, a.suffix);
    return { odp, label: `${odp} — ${cliente ? cliente + " · " : ""}${a.label}` };
  });
}

// Estrae il numero commessa da un'etichetta "NUMERO — Cliente" (stesso formato prodotto da
// CommessaAutocomplete/FormNuovoKitCommessa e salvato in kit_commessa.commessa_label) — usato
// dove si ha già la label salvata e non conviene fare un round-trip su Notion solo per questo.
export function estraiNumeroCommessa(commessaLabel: string | null | undefined): string | null {
  if (!commessaLabel) return null;
  return commessaLabel.split(" — ")[0]?.trim() || null;
}
