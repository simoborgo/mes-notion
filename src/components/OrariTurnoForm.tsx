"use client";

import { useState } from "react";
import type { OrariTurno } from "@/lib/parametriGeneraliRepository";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-28";

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{label}</span>
      <input type="time" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function OrariTurnoForm({ orariIniziali }: { orariIniziali: OrariTurno }) {
  const [orari, setOrari] = useState(orariIniziali);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const [salvato, setSalvato] = useState(false);

  function set<K extends keyof OrariTurno>(campo: K, v: string) {
    setOrari(o => ({ ...o, [campo]: v }));
    setSalvato(false);
  }

  async function salva() {
    setSalvando(true);
    setErrore("");
    setSalvato(false);
    try {
      const res = await fetch("/api/admin/orari-turno", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orari),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOrari(data);
      setSalvato(true);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "#e5e4e0" }}>
      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-black)" }}>Orari turno</h2>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Usati come riferimento nominale per la chiusura automatica di fine giornata di chi dimentica di premere &quot;Ho finito&quot;.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2" style={{ color: "var(--color-black)" }}>Lun–Ven</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Inizio turno" value={orari.turnoFerialeInizio} onChange={(v) => set("turnoFerialeInizio", v)} />
          <Campo label="Inizio pausa pranzo" value={orari.turnoFerialePausaInizio} onChange={(v) => set("turnoFerialePausaInizio", v)} />
          <Campo label="Fine pausa pranzo" value={orari.turnoFerialePausaFine} onChange={(v) => set("turnoFerialePausaFine", v)} />
          <Campo label="Fine turno" value={orari.turnoFerialeFine} onChange={(v) => set("turnoFerialeFine", v)} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2" style={{ color: "var(--color-black)" }}>Sabato</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Inizio turno" value={orari.turnoSabatoInizio} onChange={(v) => set("turnoSabatoInizio", v)} />
          <Campo label="Fine turno" value={orari.turnoSabatoFine} onChange={(v) => set("turnoSabatoFine", v)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={salva} disabled={salvando}
          className="px-3 py-1.5 text-base rounded-lg font-medium text-white disabled:opacity-60"
          style={{ background: "var(--color-primary)", borderRadius: "var(--radius-button)" }}
        >
          {salvando ? "Salvo…" : "Salva"}
        </button>
        {salvato && <span className="text-sm font-medium" style={{ color: "#166534" }}>Salvato</span>}
        {errore && <span className="text-sm font-medium" style={{ color: "#991B1B" }}>{errore}</span>}
      </div>
    </div>
  );
}
