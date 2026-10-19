import type { Scheda } from "@/lib/types";

// Intestazione della scheda nel Foglio di Scarico visto dal magazziniere: i dati per riconoscere
// subito di che ODP si tratta, copertina (si apre a dimensione intera) e link al PDF
// per i dettagli.
export default function IntestazioneSchedaMagazzino({ scheda }: { scheda: Pick<Scheda, "odp" | "numeroScheda" | "clienteInfo" | "posizione" | "copertina" | "pdfAllegato"> }) {
  const campi: { label: string; value: string }[] = [
    { label: "ODP", value: scheda.odp },
    { label: "Cliente", value: scheda.clienteInfo },
    { label: "Posizione", value: scheda.posizione },
  ];

  return (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Scheda</p>
            <h1 className="text-2xl font-bold leading-tight break-words" style={{ fontFamily: "var(--font-display)", color: "var(--color-black)" }}>
              {scheda.numeroScheda || scheda.odp || "—"}
            </h1>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2">
            {campi.map(c => (
              <div key={c.label} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>{c.label}</dt>
                <dd className="text-base font-semibold break-words" style={{ color: "var(--color-black)" }}>{c.value || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            {scheda.pdfAllegato.map((pdf, i) => (
              <a
                key={pdf.url}
                href={pdf.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg font-semibold border whitespace-nowrap"
                style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
              >
                📄 {scheda.pdfAllegato.length > 1 ? `PDF scheda ${i + 1}` : "Apri PDF scheda"}
              </a>
            ))}
          </div>
        </div>

        {scheda.copertina && (
          <a href={scheda.copertina} target="_blank" rel="noreferrer" className="sm:w-56 flex-shrink-0 block" title="Apri a dimensione intera">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scheda.copertina} alt="Copertina scheda" className="w-full max-h-64 sm:max-h-56 rounded-lg border object-contain bg-gray-50" style={{ borderColor: "#e5e4e0" }} />
          </a>
        )}
      </div>
    </div>
  );
}
