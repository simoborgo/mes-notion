"use client";

import { useMemo, useState } from "react";
import type { Operatore } from "@/lib/types";

type OperatoreConPin = Operatore & { hasPin: boolean };

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function TabellaOperatoriPin({ operatoriIniziali }: { operatoriIniziali: OperatoreConPin[] }) {
  const [operatori, setOperatori] = useState(operatoriIniziali);
  const [search, setSearch] = useState("");
  const [modaleMatricola, setModaleMatricola] = useState<string | null>(null);

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return operatori;
    return operatori.filter(o => `${o.cognome} ${o.nome} ${o.reparto}`.toLowerCase().includes(q));
  }, [operatori, search]);

  const operatoreModale = modaleMatricola ? operatori.find(o => o.matricola === modaleMatricola) ?? null : null;

  async function rimuoviPin(matricola: string) {
    if (!confirm("Rimuovere il PIN di questo operatore? Non potrà più accedere al tablet finché non gliene viene impostato uno nuovo.")) return;
    const res = await fetch(`/api/admin/operatori-pin/${matricola}`, { method: "DELETE" });
    if (res.ok) setOperatori(prev => prev.map(o => o.matricola === matricola ? { ...o, hasPin: false } : o));
  }

  function handlePinImpostato(matricola: string) {
    setOperatori(prev => prev.map(o => o.matricola === matricola ? { ...o, hasPin: true } : o));
    setModaleMatricola(null);
  }

  return (
    <div className="space-y-3">
      <input
        type="text" className={inputCls} style={{ height: 44, width: "100%" }}
        placeholder="Cerca operatore…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
        {filtrati.map(o => (
          <div
            key={o.matricola}
            className="flex items-center justify-between px-4 py-3 border-b last:border-0"
            style={{ borderColor: "#f0ece5" }}
          >
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>{o.cognome} {o.nome}</p>
              <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{o.reparto} · {o.matricola}</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={o.hasPin ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}
              >
                {o.hasPin ? "PIN impostato" : "Nessun PIN"}
              </span>
              <button
                onClick={() => setModaleMatricola(o.matricola)}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                style={{ borderColor: "#d1d5db" }}
              >
                {o.hasPin ? "Reimposta" : "Imposta"}
              </button>
              {o.hasPin && (
                <button
                  onClick={() => rimuoviPin(o.matricola)}
                  className="text-sm font-medium text-gray-400 hover:text-red-600"
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
        ))}
        {filtrati.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: "var(--color-grey-mid)" }}>Nessun operatore trovato</p>
        )}
      </div>

      {operatoreModale && (
        <ModaleImpostaPin
          operatore={operatoreModale}
          onClose={() => setModaleMatricola(null)}
          onSalvato={() => handlePinImpostato(operatoreModale.matricola)}
        />
      )}
    </div>
  );
}

function ModaleImpostaPin({ operatore, onClose, onSalvato }: { operatore: OperatoreConPin; onClose: () => void; onSalvato: () => void }) {
  const [pin, setPin] = useState("");
  const [conferma, setConferma] = useState("");
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");

  async function handleSalva() {
    if (!/^\d{4}$/.test(pin)) { setErrore("Il PIN deve essere di 4 cifre numeriche"); return; }
    if (pin !== conferma) { setErrore("I due PIN non coincidono"); return; }
    setSaving(true);
    setErrore("");
    try {
      const res = await fetch(`/api/admin/operatori-pin/${operatore.matricola}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore salvataggio");
      onSalvato();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl p-5 space-y-4" style={{ background: "white" }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>
          PIN per {operatore.cognome} {operatore.nome}
        </h3>
        <div className="space-y-2">
          <input
            type="text" inputMode="numeric" maxLength={4} className={inputCls} style={{ height: 44, width: "100%" }}
            placeholder="Nuovo PIN (4 cifre)"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <input
            type="text" inputMode="numeric" maxLength={4} className={inputCls} style={{ height: 44, width: "100%" }}
            placeholder="Conferma PIN"
            value={conferma}
            onChange={e => setConferma(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        {errore && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">Annulla</button>
          <button
            onClick={handleSalva}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
            style={{ background: "var(--color-primary)" }}
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
