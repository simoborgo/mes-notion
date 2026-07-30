"use client";

interface Props {
  titolo: string;
  messaggi: string[];
  onConferma: () => void;
  onAnnulla: () => void;
  confermaLabel?: string;
  loading?: boolean;
}

// Modale di "soft error": segnala un'incoerenza numerica (giacenza negativa, scarico oltre
// il pianificato in distinta, conteggio molto diverso dal teorico, ecc.) ma non blocca —
// l'operatore può sempre procedere comunque, perché la giacenza teorica può essere disallineata
// dalla realtà fisica e non è detto che l'azione sia sbagliata.
export default function AvvisoIncoerenzaModal({ titolo, messaggi, onConferma, onAnnulla, confermaLabel = "Conferma comunque", loading = false }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onAnnulla}
    >
      <div
        className="w-full max-w-sm rounded-xl p-5 space-y-4 bg-white shadow-2xl"
        style={{ border: "2px solid #FCA5A5" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span style={{ fontSize: 22, lineHeight: 1 }}>⚠️</span>
          <div className="min-w-0">
            <p className="font-bold text-sm" style={{ color: "#991B1B" }}>{titolo}</p>
            <div className="text-sm mt-1.5 space-y-1" style={{ color: "var(--color-black)" }}>
              {messaggi.map((m, i) => <p key={i}>{m}</p>)}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onAnnulla}
            className="px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConferma}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "#991B1B" }}
          >
            {loading ? "Registrazione…" : confermaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
