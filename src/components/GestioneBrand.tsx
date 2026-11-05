"use client";

import { useRef, useState } from "react";
import type { Brand } from "@/lib/types";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-full";
const btnCls = "px-3 py-1.5 text-sm rounded border font-medium hover:bg-gray-50 disabled:opacity-60";

async function chiama(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Errore ${res.status}`);
  return data;
}

function RigaBrand({ brand, onChange, onDeleted }: { brand: Brand; onChange: (b: Brand) => void; onDeleted: () => void }) {
  const [nome, setNome] = useState(brand.nome);
  const [alias, setAlias] = useState(brand.alias);
  const [versioneLogo, setVersioneLogo] = useState(0); // forza il ricaricamento dell'anteprima
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const sporco = nome.trim() !== brand.nome || alias.trim() !== brand.alias;

  async function esegui(fn: () => Promise<void>) {
    setOccupato(true);
    setErrore("");
    try { await fn(); } catch (e) { setErrore(e instanceof Error ? e.message : "Errore"); } finally { setOccupato(false); }
  }

  const salva = () => esegui(async () => {
    const b = (await chiama(`/api/admin/brand/${brand.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, alias }),
    })) as Brand;
    onChange(b);
  });

  const caricaLogo = (file: File) => esegui(async () => {
    const fd = new FormData();
    fd.append("file", file);
    await chiama(`/api/admin/brand/${brand.id}/logo`, { method: "PUT", body: fd });
    setVersioneLogo((v) => v + 1);
    onChange({ ...brand, haLogo: true });
  });

  const rimuoviLogo = () => esegui(async () => {
    await chiama(`/api/admin/brand/${brand.id}/logo`, { method: "DELETE" });
    onChange({ ...brand, haLogo: false });
  });

  const elimina = () => {
    if (!confirm(`Eliminare il brand "${brand.nome}"? Le commesse collegate restano, senza brand.`)) return;
    void esegui(async () => { await chiama(`/api/admin/brand/${brand.id}`, { method: "DELETE" }); onDeleted(); });
  };

  return (
    <div className="border rounded-lg bg-white p-4 flex flex-wrap items-center gap-4" style={{ borderColor: "#E4E0DA" }}>
      <div className="w-32 h-16 border rounded flex items-center justify-center bg-gray-50 shrink-0" style={{ borderColor: "#E4E0DA" }}>
        {brand.haLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/admin/brand/${brand.id}/logo?v=${versioneLogo}`} alt={brand.nome} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Nessun logo</span>
        )}
      </div>
      <div className="flex-1 min-w-[220px] grid sm:grid-cols-2 gap-3">
        <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome brand" aria-label="Nome brand" />
        <input className={inputCls} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias (es. LV, Louis Vuitton)" aria-label="Alias" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {sporco && <button type="button" className={btnCls} disabled={occupato || !nome.trim()} onClick={salva} style={{ background: "var(--color-primary)", color: "white", borderColor: "transparent" }}>Salva</button>}
        <input
          ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void caricaLogo(f); }}
        />
        <button type="button" className={btnCls} disabled={occupato} onClick={() => fileRef.current?.click()}>
          {brand.haLogo ? "Sostituisci logo" : "Carica logo"}
        </button>
        {brand.haLogo && <button type="button" className={btnCls} disabled={occupato} onClick={rimuoviLogo}>Rimuovi logo</button>}
        <button type="button" className={btnCls + " text-red-600"} disabled={occupato} onClick={elimina}>Elimina</button>
      </div>
      {errore && <p className="w-full text-sm text-red-600">{errore}</p>}
    </div>
  );
}

export default function GestioneBrand({ brandIniziali }: { brandIniziali: Brand[] }) {
  const [brand, setBrand] = useState(brandIniziali);
  const [nome, setNome] = useState("");
  const [alias, setAlias] = useState("");
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setOccupato(true);
    setErrore("");
    try {
      const b = (await chiama("/api/admin/brand", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, alias }),
      })) as Brand;
      setBrand((prev) => [...prev, b].sort((x, y) => x.nome.localeCompare(y.nome, "it", { sensitivity: "base" })));
      setNome("");
      setAlias("");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore");
    } finally {
      setOccupato(false);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <form onSubmit={crea} className="flex flex-wrap items-center gap-3">
        <input className={inputCls + " !w-56"} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nuovo brand" aria-label="Nuovo brand" />
        <input className={inputCls + " !w-64"} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias (facoltativo)" aria-label="Alias nuovo brand" />
        <button type="submit" disabled={occupato || !nome.trim()} className="px-4 py-1.5 text-sm rounded font-medium text-white disabled:opacity-60" style={{ background: "var(--color-primary)", borderRadius: "var(--radius-button)" }}>
          Aggiungi brand
        </button>
        {errore && <span className="text-sm text-red-600">{errore}</span>}
      </form>
      {brand.length === 0 && <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun brand ancora.</p>}
      <div className="space-y-3">
        {brand.map((b) => (
          <RigaBrand
            key={b.id} brand={b}
            onChange={(nuovo) => setBrand((prev) => prev.map((x) => (x.id === nuovo.id ? nuovo : x)))}
            onDeleted={() => setBrand((prev) => prev.filter((x) => x.id !== b.id))}
          />
        ))}
      </div>
    </div>
  );
}
