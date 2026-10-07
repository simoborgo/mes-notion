"use client";

import { useMemo, useState } from "react";
import type { Carico, Commessa, Scheda } from "@/lib/types";
import type { Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import DettaglioSchedaModal from "./DettaglioSchedaModal";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

// Stesso criterio di OdpSelettore: sfondo deterministico per le schede senza copertina
function coloreDaTesto(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue}, 45%, 92%)`, fg: `hsl(${hue}, 45%, 30%)` };
}

function SchedaCard({ s, onClick }: { s: Scheda; onClick: () => void }) {
  const [caricata, setCaricata] = useState(false);
  const { bg, fg } = coloreDaTesto(s.clienteInfo || s.odp);
  const label = `${s.odp}${s.numeroScheda ? ` - ${s.numeroScheda}` : ""}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border overflow-hidden text-left bg-white hover:shadow-md transition-shadow"
      style={{ borderColor: "#e5e4e0" }}
    >
      <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: "4 / 3", background: s.copertina ? "#f3f3f1" : bg }}>
        {s.copertina && (
          // eslint-disable-next-line @next/next/no-img-element -- copertine da Drive/Notion, dominio esterno non gestito da next/image
          <img
            src={s.copertina}
            alt=""
            loading="lazy"
            onLoad={() => setCaricata(true)}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: caricata ? 1 : 0, transition: "opacity 200ms" }}
          />
        )}
        <span
          className="relative px-2 py-1 rounded-md text-sm font-bold text-center"
          style={s.copertina ? { background: "rgba(0,0,0,0.55)", color: "white" } : { color: fg }}
        >
          {label}
        </span>
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-sm font-semibold truncate">{s.clienteInfo || s.descrizioneFasi || "—"}</p>
        <p className="text-xs truncate" style={{ color: "var(--color-grey-mid)" }}>
          {[s.codiceArticolo, s.posizione, s.quantita != null ? `×${s.quantita}` : ""].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="flex flex-wrap gap-1 items-center pt-0.5">
          {s.statoProduzione && <BadgeStato stato={s.statoProduzione} />}
          {s.faseCorrente && <span className="text-[11px]" style={{ color: "var(--color-grey-mid)" }}>{s.faseCorrente}</span>}
        </div>
      </div>
    </button>
  );
}

interface Props {
  carichi: Carico[];
  commesse: Commessa[];
  schede: Scheda[];
  userRole?: Role;
}

export default function OdpPerCarico({ carichi, commesse, schede: initial, userRole }: Props) {
  const [schede, setSchede] = useState(initial);
  const [commessaId, setCommessaId] = useState<string>("");
  const [nascondiChiuse, setNascondiChiuse] = useState(true);
  const [vista, setVista] = useState<"tabella" | "galleria">("galleria");
  const [viewing, setViewing] = useState<Scheda | null>(null);
  const [generando, setGenerando] = useState(false);

  const schedaMap = useMemo(() => new Map(schede.map(s => [s.id, s])), [schede]);

  const commesseVisibili = useMemo(
    () =>
      commesse
        .filter(c => !(nascondiChiuse && c.stato === "Chiusa") || c.id === commessaId)
        .sort((a, b) => b.numeroCommessa.localeCompare(a.numeroCommessa, "it", { numeric: true })),
    [commesse, nascondiChiuse, commessaId],
  );

  const commessa = commesse.find(c => c.id === commessaId) ?? null;

  const gruppi = useMemo(() => {
    if (!commessa) return [];
    return carichi
      .filter(c => c.commessaId === commessa.id)
      .sort((a, b) => (a.dataCarico ?? "9999").localeCompare(b.dataCarico ?? "9999"))
      .map(carico => ({
        carico,
        odp: carico.odpIds
          .map(id => schedaMap.get(id))
          .filter((s): s is Scheda => !!s)
          .sort((a, b) => a.odp.localeCompare(b.odp, "it", { numeric: true })),
      }));
  }, [commessa, carichi, schedaMap]);

  // Il PDF dettagliato scarica da Drive un disegno per ODP: può richiedere alcuni secondi, quindi
  // si apre la scheda subito (gesto utente, niente blocco popup) e la si porta al PDF a fine generazione.
  async function apriPdf(tipo: "riepilogo" | "dettagliato") {
    if (!commessa) return;
    const finestra = window.open("", "_blank");
    setGenerando(true);
    try {
      const res = await fetch(`/api/commesse/${commessa.id}/carichi-pdf?tipo=${tipo}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Errore generazione PDF");
      const url = URL.createObjectURL(await res.blob());
      if (finestra) finestra.location.href = url;
      else window.open(url, "_blank");
    } catch (e) {
      finestra?.close();
      alert(e instanceof Error ? e.message : "Errore generazione PDF");
    } finally {
      setGenerando(false);
    }
  }

  function handleAggiornata(updated: Scheda) {
    setSchede(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    setViewing(updated);
  }

  const toggleBtn = (v: "tabella" | "galleria", label: string) => (
    <button
      type="button"
      onClick={() => setVista(v)}
      className="px-4 rounded-md text-sm font-semibold"
      style={{ height: 36, background: vista === v ? "var(--color-black)" : "transparent", color: vista === v ? "white" : "var(--color-grey-mid)" }}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-96 max-w-full"
          value={commessaId}
          onChange={e => setCommessaId(e.target.value)}
        >
          <option value="">Seleziona una commessa…</option>
          {commesseVisibili.map(c => (
            <option key={c.id} value={c.id}>
              {[c.numeroCommessa, c.cliente, c.localita, c.stato, c.responsabile, c.dataCarico ? `carico ${fmt(c.dataCarico)}` : ""].filter(Boolean).join(" · ")}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: "var(--color-black)" }}>
          <input
            type="checkbox"
            checked={nascondiChiuse}
            onChange={(e) => setNascondiChiuse(e.target.checked)}
            className="w-4 h-4 cursor-pointer accent-orange-500"
          />
          Nascondi commesse chiuse
        </label>

        <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "#d1d5db" }}>
          {toggleBtn("galleria", "Galleria")}
          {toggleBtn("tabella", "Tabella")}
        </div>

        {commessa && (
          <div className="flex flex-wrap gap-2 ml-auto">
            <a
              href={`/api/commesse/${commessa.id}/carichi-excel`}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-white hover:bg-gray-50"
              style={{ borderColor: "#d1d5db" }}
            >
              Excel
            </a>
            <button
              type="button"
              disabled={generando}
              onClick={() => apriPdf("riepilogo")}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-white hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: "#d1d5db" }}
            >
              Stampa riepilogo
            </button>
            <button
              type="button"
              disabled={generando}
              onClick={() => apriPdf("dettagliato")}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-primary)" }}
            >
              {generando ? "Generazione…" : "Stampa dettagliata"}
            </button>
          </div>
        )}
      </div>

      {!commessa ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Seleziona una commessa per vedere i carichi e gli ODP previsti
        </p>
      ) : gruppi.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Nessun carico per questa commessa
        </p>
      ) : (
        gruppi.map(({ carico, odp }) => (
          <section key={carico.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b" style={{ borderColor: "#E4E0DA" }}>
              <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>{carico.titolo || "Senza titolo"}</h2>
              <span className="text-sm tabular-nums" style={{ color: "var(--color-grey-mid)" }}>{fmt(carico.dataCarico)}</span>
              {carico.modalita && <BadgeStato stato={carico.modalita} />}
              {carico.stato && <BadgeStato stato={carico.stato} />}
              <span className="text-sm font-medium" style={{ color: "var(--color-grey-mid)" }}>{odp.length} ODP</span>
            </div>
            {odp.length === 0 ? (
              <p className="py-4 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun ODP collegato a questo carico</p>
            ) : vista === "galleria" ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {odp.map(s => <SchedaCard key={s.id} s={s} onClick={() => setViewing(s)} />)}
              </div>
            ) : (
              <TabellaOdp odp={odp} onSelect={setViewing} />
            )}
          </section>
        ))
      )}

      {viewing && (
        <DettaglioSchedaModal
          scheda={viewing}
          onClose={() => setViewing(null)}
          userRole={userRole}
          onSchedaAggiornata={handleAggiornata}
        />
      )}
    </div>
  );
}

function TabellaOdp({ odp, onSelect }: { odp: Scheda[]; onSelect: (s: Scheda) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
            <th className="px-4 py-3 w-20">Copertina</th>
            <th className="px-4 py-3">ODP</th>
            <th className="px-4 py-3">Cliente / Descrizione</th>
            <th className="px-4 py-3">Articolo</th>
            <th className="px-4 py-3 text-right">Q.tà</th>
            <th className="px-4 py-3">Stato</th>
            <th className="px-4 py-3">Fase</th>
            <th className="px-4 py-3">Prod. prevista</th>
          </tr>
        </thead>
        <tbody>
          {odp.map(s => (
            <tr key={s.id} onClick={() => onSelect(s)} className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer transition-colors">
              <td className="px-4 py-2">
                {s.copertina ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vedi SchedaCard
                  <img src={s.copertina} alt="" loading="lazy" className="w-14 h-10 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
                ) : (
                  <div className="w-14 h-10 rounded" style={{ background: coloreDaTesto(s.clienteInfo || s.odp).bg }} />
                )}
              </td>
              <td className="px-4 py-2 font-medium whitespace-nowrap">{s.odp}{s.numeroScheda ? ` - ${s.numeroScheda}` : ""}</td>
              <td className="px-4 py-2">{s.clienteInfo || s.descrizioneFasi || "—"}</td>
              <td className="px-4 py-2">{[s.codiceArticolo, s.posizione].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{s.quantita ?? "—"}</td>
              <td className="px-4 py-2">{s.statoProduzione ? <BadgeStato stato={s.statoProduzione} /> : "—"}</td>
              <td className="px-4 py-2">{s.faseCorrente || "—"}</td>
              <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmt(s.dataProduzionePrevista)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
