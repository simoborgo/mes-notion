"use client";

import { useState } from "react";
import { Tastierino, STORAGE_KEY, type OperatoreLoggato } from "./OperatoreTablet";

export interface SchedaScansionata {
  id: string;
  odp: string;
  tipologia: string;
  numeroScheda: string;
  commessaNr: string;
  clienteInfo: string;
  codiceArticolo: string;
  posizione: string;
  quantita: number | null;
  statoProduzione: string;
  fornitore: string;
  pdfUrl: string | null;
}

interface ContestoAzione {
  scheda: SchedaScansionata;
  operatore: OperatoreLoggato | null; // sempre valorizzato se l'azione dichiara richiedeOperatore
  vai: (url: string) => void;
}

interface AzioneScheda {
  id: string;
  titolo: string;
  descrizione: (s: SchedaScansionata) => string;
  // true = prima di eseguire si chiede il PIN (identifica chi sta agendo)
  richiedeOperatore: boolean;
  visibile: (s: SchedaScansionata) => boolean;
  esegui: (ctx: ContestoAzione) => void;
}

// Elenco delle azioni offerte dopo la scansione. Per aggiungere un comportamento basta una voce
// qui: la pagina gestisce da sola la visibilità e, se serve, la richiesta del PIN. Il QR non cambia
// (contiene solo il codice della scheda), quindi le etichette già stampate restano valide.
const AZIONI: AzioneScheda[] = [
  {
    id: "ore",
    titolo: "Registra ore",
    descrizione: (s) => `Lavori su ${s.odp}`,
    richiedeOperatore: true,
    visibile: (s) => !!s.odp,
    esegui: ({ scheda, operatore, vai }) => {
      // Stesso storage del tablet operatore: /operatore ritrova l'operatore già identificato e
      // propone l'ODP (preselezionato, da confermare con un tocco).
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(operatore));
      vai(`/operatore?odp=${encodeURIComponent(scheda.odp)}`);
    },
  },
  {
    id: "pdf",
    titolo: "Apri PDF",
    descrizione: () => "Disegno e cartiglio della scheda",
    richiedeOperatore: false,
    visibile: (s) => !!s.pdfUrl,
    esegui: ({ scheda, vai }) => vai(scheda.pdfUrl!),
  },
];

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
      <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: "var(--color-grey-mid)" }}>{etichetta}</span>
      <span className="text-base font-semibold text-right break-words min-w-0" style={{ color: "var(--color-black)" }}>{valore || "—"}</span>
    </div>
  );
}

function Cornice({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center px-4 py-8" style={{ background: "var(--color-offwhite)" }}>
      <div className="w-full max-w-md md:max-w-2xl space-y-4">{children}</div>
    </div>
  );
}

export default function ScansioneScheda({ codice, scheda }: { codice: string; scheda: SchedaScansionata | null }) {
  const [azionePin, setAzionePin] = useState<AzioneScheda | null>(null); // azione in attesa del PIN
  const [pin, setPin] = useState("");
  const [errore, setErrore] = useState("");
  const [verificando, setVerificando] = useState(false);

  if (!scheda) {
    return (
      <Cornice>
        <div className="rounded-2xl border bg-white p-6 text-center space-y-2" style={{ borderColor: "#E4E0DA" }}>
          <p className="text-lg font-bold" style={{ color: "#991B1B" }}>Codice non riconosciuto</p>
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
            Nessuna scheda corrisponde al codice <span className="font-mono font-bold">{codice}</span>. L&apos;etichetta potrebbe
            essere di una scheda eliminata: chiedi al responsabile di ristamparla.
          </p>
        </div>
      </Cornice>
    );
  }

  const vai = (url: string) => window.location.assign(url);
  const azioni = AZIONI.filter(a => a.visibile(scheda));

  function avvia(a: AzioneScheda) {
    if (!scheda) return;
    if (a.richiedeOperatore) { setAzionePin(a); setPin(""); setErrore(""); return; }
    a.esegui({ scheda, operatore: null, vai });
  }

  async function handleDigit(d: string) {
    if (verificando || !azionePin || !scheda) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setErrore("");
    if (next.length < 4) return;
    setVerificando(true);
    try {
      const res = await fetch("/api/ore/operatore/verifica-pin-solo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: next }),
      });
      const json = await res.json();
      if (!res.ok) { setErrore(json.error ?? "PIN errato"); setPin(""); return; }
      const operatore: OperatoreLoggato = {
        matricola: json.matricola, cognome: json.cognome, nome: json.nome,
        reparto: json.reparto, azienda: json.azienda, token: json.token,
      };
      azionePin.esegui({ scheda, operatore, vai });
    } catch {
      setErrore("Errore di rete");
      setPin("");
    } finally {
      setVerificando(false);
    }
  }

  return (
    <Cornice>
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: "#E4E0DA" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
          {scheda.tipologia}{scheda.statoProduzione ? ` · ${scheda.statoProduzione}` : ""}
        </p>
        <p className="text-3xl font-extrabold mt-1" style={{ color: "var(--color-black)" }}>{scheda.odp || "—"}</p>
        {scheda.numeroScheda && (
          <p className="text-base font-semibold mt-1" style={{ color: "var(--color-black)" }}>{scheda.numeroScheda}</p>
        )}
        <div className="mt-3">
          <Riga etichetta="Commessa" valore={scheda.clienteInfo || scheda.commessaNr} />
          <Riga etichetta="Cod. articolo" valore={scheda.codiceArticolo} />
          <Riga etichetta="Posizione" valore={scheda.posizione} />
          <Riga etichetta="Quantità" valore={scheda.quantita != null ? String(scheda.quantita) : ""} />
          {scheda.fornitore && <Riga etichetta="Fornitore" valore={scheda.fornitore} />}
        </div>
      </div>

      {azionePin ? (
        <div className="rounded-2xl border bg-white p-5 space-y-4" style={{ borderColor: "#E4E0DA" }}>
          <p className="text-sm font-medium text-center" style={{ color: "var(--color-grey-mid)" }}>
            {azionePin.titolo}: inserisci il tuo PIN
          </p>
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="rounded-full" style={{ width: 16, height: 16, background: i < pin.length ? "var(--color-primary)" : "#E4E0DA" }} />
            ))}
          </div>
          {errore && <p className="text-sm font-medium text-center" style={{ color: "#991B1B" }}>{errore}</p>}
          <Tastierino onDigit={handleDigit} onCancella={() => setPin(p => p.slice(0, -1))} disabled={verificando} />
          <button type="button" onClick={() => setAzionePin(null)} className="w-full text-sm font-medium underline" style={{ color: "var(--color-grey-mid)" }}>
            Annulla
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {azioni.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => avvia(a)}
              className="w-full rounded-2xl border bg-white px-5 py-4 text-left active:opacity-80"
              style={{ borderColor: "#E4E0DA" }}
            >
              <span className="block text-lg font-bold" style={{ color: "var(--color-black)" }}>{a.titolo}</span>
              <span className="block text-sm mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                {a.descrizione(scheda)}{a.richiedeOperatore ? " · richiede PIN" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </Cornice>
  );
}
