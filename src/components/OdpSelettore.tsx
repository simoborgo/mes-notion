"use client";

import { useMemo, useState } from "react";
import type { OdpAttivo } from "@/lib/types";
import OdpAutocomplete from "./OdpAutocomplete";

interface Props {
  odpList: OdpAttivo[];
  value: string | null;
  onChange: (odp: string | null) => void;
  placeholder?: string;
}

// Colore/iniziali deterministici per le commesse senza copertina, cosi le card restano
// riconoscibili a colpo d'occhio anche senza foto reale (v1: nessun campo colore su ODP).
function coloreDaTesto(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue}, 45%, 92%)`, fg: `hsl(${hue}, 45%, 30%)` };
}

function inizialiDaTesto(seed: string): string {
  return seed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
}

export default function OdpSelettore({ odpList, value, onChange, placeholder }: Props) {
  const [modo, setModo] = useState<"elenco" | "griglia">("elenco");

  // Con un ODP già selezionato mostriamo sempre la stessa chip compatta, in entrambe le modalità
  if (value) {
    return <OdpAutocomplete odpList={odpList} value={value} onChange={onChange} placeholder={placeholder} />;
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "#d1d5db" }}>
        <button
          type="button"
          onClick={() => setModo("elenco")}
          className="px-4 rounded-md text-sm font-semibold"
          style={{ height: 36, background: modo === "elenco" ? "var(--color-black)" : "transparent", color: modo === "elenco" ? "white" : "var(--color-grey-mid)" }}
        >
          Elenco
        </button>
        <button
          type="button"
          onClick={() => setModo("griglia")}
          className="px-4 rounded-md text-sm font-semibold"
          style={{ height: 36, background: modo === "griglia" ? "var(--color-black)" : "transparent", color: modo === "griglia" ? "white" : "var(--color-grey-mid)" }}
        >
          Griglia
        </button>
      </div>

      {modo === "elenco" ? (
        <OdpAutocomplete odpList={odpList} value={value} onChange={onChange} placeholder={placeholder} />
      ) : (
        <OdpGriglia odpList={odpList} onChange={onChange} />
      )}
    </div>
  );
}

function OdpGriglia({ odpList, onChange }: { odpList: OdpAttivo[]; onChange: (odp: string) => void }) {
  const [cliente, setCliente] = useState("");
  const [commessa, setCommessa] = useState("");
  const hasFiltro = cliente.trim() !== "" || commessa.trim() !== "";

  const risultati = useMemo(() => {
    if (!hasFiltro) return [];
    const c = cliente.trim().toLowerCase();
    const n = commessa.trim().toLowerCase();
    return odpList
      .filter(o => !o.isSpeciale)
      .filter(o => (!c || (o.clienteInfo ?? "").toLowerCase().includes(c)))
      .filter(o => (!n || (o.commessaNr ?? "").toLowerCase().includes(n) || o.odp.toLowerCase().includes(n)))
      .slice(0, 60);
  }, [odpList, cliente, commessa, hasFiltro]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          className="w-full rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          style={{ height: 44, borderColor: "#d1d5db" }}
          placeholder="Cliente…"
          value={cliente}
          onChange={e => setCliente(e.target.value)}
        />
        <input
          type="text"
          className="w-full rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          style={{ height: 44, borderColor: "#d1d5db" }}
          placeholder="Nr. commessa…"
          value={commessa}
          onChange={e => setCommessa(e.target.value)}
        />
      </div>

      {!hasFiltro ? (
        <p
          className="text-sm text-center py-8 rounded-xl border border-dashed"
          style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0" }}
        >
          Cerca un cliente o una commessa per vedere le schede
        </p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
          {risultati.map(o => (
            <OdpCard key={o.odp} o={o} onClick={() => onChange(o.odp)} />
          ))}
          {risultati.length === 0 && (
            <p className="col-span-full text-sm text-center py-6" style={{ color: "var(--color-grey-mid)" }}>
              Nessuna commessa trovata
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OdpCard({ o, onClick }: { o: OdpAttivo; onClick: () => void }) {
  const [caricata, setCaricata] = useState(false);
  const seed = o.clienteInfo || o.odp;
  const { bg, fg } = coloreDaTesto(seed);
  const iniziali = inizialiDaTesto(seed);

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border overflow-hidden text-left active:scale-[0.98] transition-transform"
      style={{ borderColor: "#e5e4e0", minHeight: 44 }}
    >
      <div className="w-full flex items-center justify-center" style={{ aspectRatio: "4 / 3", background: o.copertina ? "#f3f3f1" : bg }}>
        {o.copertina ? (
          // eslint-disable-next-line @next/next/no-img-element -- copertine arrivano da Notion, dominio esterno non gestito da next/image
          <img
            src={o.copertina}
            alt=""
            loading="lazy"
            onLoad={() => setCaricata(true)}
            className="w-full h-full object-cover"
            style={{ opacity: caricata ? 1 : 0, transition: "opacity 200ms" }}
          />
        ) : (
          <span className="font-bold text-lg" style={{ color: fg }}>{iniziali || "—"}</span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs font-semibold truncate" style={{ color: "var(--color-black)" }}>{o.clienteInfo || o.odp}</p>
        <p className="text-[11px] truncate" style={{ color: "var(--color-grey-mid)" }}>
          {o.odp}{o.numeroScheda ? ` - ${o.numeroScheda}` : ""}
        </p>
      </div>
    </button>
  );
}
