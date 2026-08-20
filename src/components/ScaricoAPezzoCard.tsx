"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticoloFerramenta, OdpAttivo } from "@/lib/types";
import OdpAutocomplete from "./OdpAutocomplete";
import AvvisoIncoerenzaModal from "./AvvisoIncoerenzaModal";

interface DistintaCheck {
  pianificato: number | null;
  giaScaricato: number;
}

export default function ScaricoAPezzoCard({ articolo, odpList = [], initialOdp = null, ritorno = null, scaricoId }: { articolo: ArticoloFerramenta; odpList?: OdpAttivo[]; initialOdp?: string | null; ritorno?: string | null; scaricoId?: string }) {
  const router = useRouter();
  const destinazione = ritorno || "/ferramenta";
  const [quantita, setQuantita] = useState("");
  const [stato, setStato] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [odp, setOdp] = useState<string | null>(initialOdp);
  const [distintaCheck, setDistintaCheck] = useState<DistintaCheck | null>(null);
  const [avviso, setAvviso] = useState<string[] | null>(null);

  const odpMatch = odp ? odpList.find(o => o.odp === odp) : null;

  useEffect(() => {
    if (!odpMatch?.id) { setDistintaCheck(null); return; }
    let cancelled = false;
    fetch(`/api/ferramenta/kit/${odpMatch.id}/scarico-check?articoloId=${articolo.id}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDistintaCheck(data); })
      .catch(() => { if (!cancelled) setDistintaCheck(null); });
    return () => { cancelled = true; };
  }, [odpMatch?.id, articolo.id]);

  // Redirect automatico dopo la conferma — non in modalità scarico a giro (il prossimo passo è
  // scansionare il QR successivo, non navigare).
  useEffect(() => {
    if (stato !== "done" || scaricoId) return;
    const t = setTimeout(() => router.push(destinazione), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato]);

  async function eseguiScarico(q: number) {
    setAvviso(null);
    if (stato === "loading" || stato === "done") return;
    setStato("loading");
    setError("");
    try {
      const res = scaricoId
        ? await fetch(`/api/ferramenta/scarichi/${scaricoId}/righe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articoloId: articolo.id, quantita: q }),
          })
        : await fetch(`/api/ferramenta/articoli/${articolo.id}/scarico`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantita: q, odpId: odpMatch?.id ?? odp, odpLabel: odp }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      setStato("done");
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore durante lo scarico.");
    }
  }

  function handleScarico() {
    const q = Number(quantita);
    if (!q || q <= 0) {
      setError("Inserisci una quantità valida");
      return;
    }
    setError("");

    const messaggi: string[] = [];
    const giacenzaRisultante = articolo.giacenzaAttuale - q;
    if (giacenzaRisultante < 0) {
      messaggi.push(`La giacenza diventerà negativa: ${articolo.giacenzaAttuale} − ${q} = ${giacenzaRisultante} ${articolo.unitaMisura}.`);
    }

    if (distintaCheck?.pianificato != null) {
      const totale = distintaCheck.giaScaricato + q;
      if (totale > distintaCheck.pianificato) {
        messaggi.push(`Superi il pianificato in distinta per questo ODP: pianificato ${distintaCheck.pianificato}, già scaricato ${distintaCheck.giaScaricato}, ora ${q} (totale ${totale}).`);
      }
    }

    if (messaggi.length > 0) {
      setAvviso(messaggi);
      return;
    }
    void eseguiScarico(q);
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
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>{scaricoId ? "Aggiunto allo scarico" : "Scarico registrato"}</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>{articolo.descrizione} — {quantita} {articolo.unitaMisura}</p>
          </div>
        </div>
        {scaricoId ? (
          <>
            <p className="text-xs text-center" style={{ color: "#166534" }}>Scansiona il prossimo articolo, oppure:</p>
            <a
              href={`/ferramenta/scarichi/${scaricoId}`}
              className="block text-center w-full py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#166534" }}
            >
              Vai allo scarico →
            </a>
          </>
        ) : (
          <button
            onClick={() => router.push(destinazione)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "#166534" }}
          >
            {ritorno ? "Torna alla richiesta ferramenta ODP →" : "Torna alle giacenze →"}
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

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          Quantità consumata ({articolo.unitaMisura || "unità"})
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          className="w-full rounded-lg border px-3 text-lg font-semibold"
          style={{ height: 52, borderColor: "#d1d5db" }}
          placeholder="0"
        />
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
        {stato === "loading" ? "Registrazione in corso…" : scaricoId ? "Aggiungi allo scarico" : "Conferma scarico"}
      </button>

      {avviso && (
        <AvvisoIncoerenzaModal
          titolo="Valori non coerenti"
          messaggi={avviso}
          loading={stato === "loading"}
          onAnnulla={() => setAvviso(null)}
          onConferma={() => void eseguiScarico(Number(quantita))}
        />
      )}
    </div>
  );
}
