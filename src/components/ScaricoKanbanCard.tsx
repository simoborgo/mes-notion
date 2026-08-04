"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticoloFerramenta, OdpAttivo } from "@/lib/types";
import OdpAutocomplete from "./OdpAutocomplete";
import AvvisoIncoerenzaModal from "./AvvisoIncoerenzaModal";

type Stato = "idle" | "loading" | "sotto-soglia" | "done" | "error";

interface DistintaCheck {
  pianificato: number | null;
  giaScaricato: number;
}

export default function ScaricoKanbanCard({ articolo, odpList = [], initialOdp = null, ritorno = null, distintaId }: { articolo: ArticoloFerramenta; odpList?: OdpAttivo[]; initialOdp?: string | null; ritorno?: string | null; distintaId?: string }) {
  const router = useRouter();
  const destinazione = ritorno || "/ferramenta";
  const [stato, setStato] = useState<Stato>("idle");
  const [error, setError] = useState("");
  const [odp, setOdp] = useState<string | null>(initialOdp);
  const [distintaCheck, setDistintaCheck] = useState<DistintaCheck | null>(null);
  const [avviso, setAvviso] = useState<string[] | null>(null);
  // Quante vaschette/confezioni sono state ritirate — mai una quantità libera, sempre
  // un multiplo intero di quantitaStandardVaschetta, calcolato qui e mai digitabile a mano.
  const [moltiplicatore, setMoltiplicatore] = useState(1);
  const quantitaUnitaria = articolo.quantitaStandardVaschetta ?? 0;
  const quantitaTotale = quantitaUnitaria * moltiplicatore;

  const odpMatch = odp ? odpList.find(o => o.odp === odp) : null;

  // Ogni volta che si collega un ODP con Scheda reale, recupera pianificato/già-scaricato
  // in distinta per questo articolo — serve per l'avviso "stai superando il pianificato".
  useEffect(() => {
    if (!odpMatch?.id) { setDistintaCheck(null); return; }
    let cancelled = false;
    fetch(`/api/ferramenta/kit/${odpMatch.id}/scarico-check?articoloId=${articolo.id}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDistintaCheck(data); })
      .catch(() => { if (!cancelled) setDistintaCheck(null); });
    return () => { cancelled = true; };
  }, [odpMatch?.id, articolo.id]);

  // Redirect automatico dopo la conferma — altrimenti si resta bloccati sulla schermata
  // di successo. Non parte se c'è il modal sotto-soglia (prima si decide se stampare) né
  // in modalità distinta (il prossimo passo è scansionare il QR successivo, non navigare).
  useEffect(() => {
    if (stato !== "done" || distintaId) return;
    const t = setTimeout(() => router.push(destinazione), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato]);

  async function eseguiScarico() {
    setAvviso(null);
    if (stato === "loading" || stato === "done") return;
    setStato("loading");
    setError("");
    try {
      const res = distintaId
        ? await fetch(`/api/ferramenta/distinte-scarico/${distintaId}/righe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articoloId: articolo.id, quantita: quantitaTotale }),
          })
        : await fetch(`/api/ferramenta/articoli/${articolo.id}/scarico`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ odpId: odpMatch?.id ?? odp, odpLabel: odp, moltiplicatore }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      setStato(data.sottoSoglia ? "sotto-soglia" : "done");
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore durante lo scarico.");
    }
  }

  function handleScarico() {
    const messaggi: string[] = [];

    const giacenzaRisultante = articolo.giacenzaAttuale - quantitaTotale;
    if (giacenzaRisultante < 0) {
      messaggi.push(`La giacenza diventerà negativa: ${articolo.giacenzaAttuale} − ${quantitaTotale} = ${giacenzaRisultante} ${articolo.unitaMisura}.`);
    }

    if (distintaCheck?.pianificato != null) {
      const totale = distintaCheck.giaScaricato + quantitaTotale;
      if (totale > distintaCheck.pianificato) {
        messaggi.push(`Superi il pianificato in distinta per questo ODP: pianificato ${distintaCheck.pianificato}, già scaricato ${distintaCheck.giaScaricato}, ora ${quantitaTotale} (totale ${totale}).`);
      }
    }

    if (messaggi.length > 0) {
      setAvviso(messaggi);
      return;
    }
    void eseguiScarico();
  }

  if (stato === "sotto-soglia") {
    return (
      <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
        <div>
          <p className="font-semibold text-sm" style={{ color: "#991B1B" }}>⚠ Giacenza sotto soglia minima</p>
          <p className="text-xs mt-0.5" style={{ color: "#991B1B" }}>{articolo.descrizione} — vuoi stampare l&apos;etichetta di riordino?</p>
        </div>
        <a
          href={`/api/ferramenta/articoli/${articolo.id}/etichetta-riordino`}
          target="_blank"
          rel="noreferrer"
          className="block text-center w-full py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "#991B1B" }}
        >
          Stampa etichetta di riordino
        </a>
        <button
          onClick={() => setStato("done")}
          className="w-full py-2 rounded-lg text-sm font-medium"
          style={{ color: "#6b6966", border: "1px solid #e5e4e0" }}
        >
          Continua
        </button>
      </div>
    );
  }

  if (stato === "done") {
    return (
      <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>{distintaId ? "Aggiunto alla distinta" : "Scarico registrato"}</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>{articolo.descrizione}</p>
          </div>
        </div>
        {distintaId ? (
          <>
            <p className="text-xs text-center" style={{ color: "#166534" }}>Scansiona il prossimo articolo, oppure:</p>
            <a
              href={`/ferramenta/distinte-scarico/${distintaId}`}
              className="block text-center w-full py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#166534" }}
            >
              Vai alla distinta →
            </a>
          </>
        ) : (
          <button
            onClick={() => router.push(destinazione)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "#166534" }}
          >
            {ritorno ? "Torna al foglio di scarico →" : "Torna alle giacenze →"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{articolo.descrizione}</p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{articolo.codiceOs1}</p>
      </div>
      <div className="rounded-lg p-3 space-y-2" style={{ background: "#F5F2EE" }}>
        <label className="text-xs font-medium block" style={{ color: "var(--color-grey-mid)" }}>
          Quante vaschette/confezioni hai prelevato?
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMoltiplicatore(m => Math.max(1, m - 1))}
            disabled={moltiplicatore <= 1}
            className="flex items-center justify-center rounded-lg font-bold disabled:opacity-40"
            style={{ width: 44, height: 44, background: "white", border: "1px solid #d1d5db", fontSize: 20 }}
          >
            −
          </button>
          <span className="flex-1 text-center font-bold text-2xl tabular-nums" style={{ color: "var(--color-black)" }}>
            {moltiplicatore}
          </span>
          <button
            type="button"
            onClick={() => setMoltiplicatore(m => m + 1)}
            className="flex items-center justify-center rounded-lg font-bold"
            style={{ width: 44, height: 44, background: "white", border: "1px solid #d1d5db", fontSize: 20 }}
          >
            +
          </button>
        </div>
        <p className="text-sm text-center" style={{ color: "var(--color-black)" }}>
          Verranno scaricate <strong>{quantitaTotale} {articolo.unitaMisura}</strong>
          {moltiplicatore > 1 && (
            <span style={{ color: "var(--color-grey-mid)" }}> ({moltiplicatore} × {quantitaUnitaria})</span>
          )}
        </p>
      </div>

      {odpList.length > 0 && (
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
            ODP (facoltativo)
          </label>
          <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} placeholder="Collega a un ODP…" />
        </div>
      )}

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={handleScarico}
        disabled={stato === "loading"}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: "var(--color-primary)" }}
      >
        {stato === "loading" && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {stato === "loading"
          ? "Registrazione in corso…"
          : distintaId
            ? `Aggiungi alla distinta — ${quantitaTotale} ${articolo.unitaMisura}`
            : `Scarica ${quantitaTotale} ${articolo.unitaMisura}`}
      </button>

      {avviso && (
        <AvvisoIncoerenzaModal
          titolo="Valori non coerenti"
          messaggi={avviso}
          loading={stato === "loading"}
          onAnnulla={() => setAvviso(null)}
          onConferma={() => void eseguiScarico()}
        />
      )}
    </div>
  );
}
