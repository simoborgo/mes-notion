import type { Scheda } from "@/lib/types";
import type { VoceAttivita } from "@/lib/audit";
import BadgeStato from "./BadgeStato";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

function Titolo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12.1px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9c9894" }}>{children}</h3>;
}

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15.4px]">
      <span style={{ color: "var(--color-grey-mid)" }}>{etichetta}</span>
      <span className="font-semibold tabular-nums text-right">{children}</span>
    </div>
  );
}

// Colonna fissa a destra della pagina piena: il riepilogo resta visibile qualunque tab sia aperta.
export default function SchedaColonnaLaterale({ scheda: s, attivita }: { scheda: Scheda; attivita: VoceAttivita[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const aperta = !["Completato", "Annullata"].includes(s.statoProduzione);
  const inRitardoProd = aperta && !!s.dataProduzionePrevista && s.dataProduzionePrevista < today;
  const giorniRitardoRientro = aperta && s.produzioneEsterna && s.dataRientroPrevista && s.dataRientroPrevista < today && s.statoProdEsterna !== "Rientrato"
    ? Math.round((new Date(today).getTime() - new Date(s.dataRientroPrevista).getTime()) / 86_400_000)
    : 0;

  return (
    <aside className="p-5 space-y-6 border-t lg:border-t-0 lg:border-l min-w-0" style={{ background: "#f8f7f5", borderColor: "#e5e4e0" }} aria-label="Riepilogo scheda">
      <div>
        <Titolo>Date</Titolo>
        <div className="space-y-1.5">
          <Riga etichetta="Ricevuta il">{fmt(s.dataSchedaRicevuta)}</Riga>
          <Riga etichetta="Produzione prevista">
            <span style={inRitardoProd ? { color: "#DC2626" } : undefined}>{fmt(s.dataProduzionePrevista)}</span>
          </Riga>
          {s.dataProduzioneEffettiva && <Riga etichetta="Completata il">{fmt(s.dataProduzioneEffettiva)}</Riga>}
        </div>
      </div>

      {(s.fornitore || s.produzioneEsterna) && (
        <div>
          <Titolo>Fornitore (giro attivo)</Titolo>
          <div className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: "white", border: "1px solid #e5e4e0" }}>
            <div className="text-[15.4px] font-semibold">{s.fornitore || "Fornitore da definire"}</div>
            <div className="flex items-center gap-2 flex-wrap text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>
              {s.statoProdEsterna && <BadgeStato stato={s.statoProdEsterna} />}
              {s.dataRientroPrevista && <span>Rientro {fmt(s.dataRientroPrevista)}</span>}
              {giorniRitardoRientro > 0 && <span className="font-bold" style={{ color: "#DC2626" }}>+{giorniRitardoRientro} gg</span>}
            </div>
          </div>
        </div>
      )}

      <div>
        <Titolo>Attività recente</Titolo>
        {attivita.length === 0 ? (
          <p className="text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>Nessuna operazione registrata.</p>
        ) : (
          <ul className="space-y-0">
            {attivita.map((a, i) => (
              <li key={i} className="grid gap-2 py-1.5 text-[13.2px] border-b border-dashed last:border-0" style={{ gridTemplateColumns: "52px 1fr", borderColor: "#e5e4e0" }}>
                <time className="tabular-nums" style={{ color: "#9c9894" }}>
                  {new Date(a.data).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" })}
                </time>
                <span>{a.testo} <span style={{ color: "var(--color-grey-mid)" }}>· {a.operatore}</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
