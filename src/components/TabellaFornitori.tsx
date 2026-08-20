"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Fornitore } from "@/lib/types";
import FormFornitore from "./FormFornitore";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function TabellaFornitori({ fornitoriIniziali }: { fornitoriIniziali: Fornitore[] }) {
  const router = useRouter();
  const [fornitori, setFornitori] = useState(fornitoriIniziali);
  const [search, setSearch] = useState("");
  const [formAperto, setFormAperto] = useState<"nuovo" | Fornitore | null>(null);

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return fornitori;
    return fornitori.filter(f => `${f.nome} ${f.codiceOs1} ${f.email ?? ""}`.toLowerCase().includes(q));
  }, [fornitori, search]);

  const conCodiceOs1 = fornitori.filter(f => f.codiceOs1).length;

  function handleSaved(aggiornato: Fornitore) {
    setFornitori(prev => {
      const esiste = prev.some(f => f.id === aggiornato.id);
      const next = esiste ? prev.map(f => (f.id === aggiornato.id ? aggiornato : f)) : [...prev, aggiornato];
      return [...next].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    });
    setFormAperto(null);
    router.refresh();
  }

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "#e5e4e0" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>Fornitori</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
            Anagrafica condivisa da Schede, Ritiri e Ferramenta — il Codice OS1 è la chiave usata per l&apos;abbinamento automatico durante gli import.
          </p>
        </div>
        <button
          onClick={() => setFormAperto("nuovo")}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
          style={{ background: "var(--color-primary)" }}
        >
          + Nuovo fornitore
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#F5F2EE", color: "var(--color-black)" }}>
          Totale: {fornitori.length}
        </div>
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
          Con Codice OS1: {conCodiceOs1}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text" className={inputCls} style={{ minWidth: 220 }}
          placeholder="Cerca nome, codice OS1, email…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{filtrati.length} risultati</span>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
        <table className="text-base w-full">
          <thead>
            <tr className="border-b text-sm font-semibold uppercase" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
              <th className="text-left px-3 py-2">Nome</th>
              <th className="text-left px-3 py-2">Codice OS1</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtrati.map(f => (
              <tr key={f.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                <td className="px-3 py-2 font-medium">{f.nome}</td>
                <td className="px-3 py-2 font-mono text-sm" style={{ color: "var(--color-grey-mid)" }}>{f.codiceOs1 || "—"}</td>
                <td className="px-3 py-2 text-sm" style={{ color: "var(--color-grey-mid)" }}>{f.email || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setFormAperto(f)}
                    className="text-sm font-medium px-2 py-1 rounded hover:bg-gray-100"
                    style={{ color: "var(--color-grey-mid)" }}
                  >
                    Modifica
                  </button>
                </td>
              </tr>
            ))}
            {filtrati.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun fornitore trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formAperto && (
        <FormFornitore
          fornitore={formAperto === "nuovo" ? undefined : formAperto}
          onClose={() => setFormAperto(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
