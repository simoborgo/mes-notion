"use client";

import { useMemo, useState } from "react";

type Modo = "mese" | "trimestre" | "intervallo";

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

const pad = (n: number) => String(n).padStart(2, "0");
// Ultimo giorno del mese m (1-12) senza passare da UTC
const ultimoGiorno = (y: number, m: number) => new Date(y, m, 0).getDate();

export default function ExportOreExcel() {
  const oggi = new Date();
  const [modo, setModo] = useState<Modo>("mese");
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [trimestre, setTrimestre] = useState(Math.floor(oggi.getMonth() / 3) + 1);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const periodo = useMemo(() => {
    if (modo === "mese") return { da: `${anno}-${pad(mese)}-01`, a: `${anno}-${pad(mese)}-${pad(ultimoGiorno(anno, mese))}` };
    if (modo === "trimestre") {
      const m1 = (trimestre - 1) * 3 + 1;
      const m3 = m1 + 2;
      return { da: `${anno}-${pad(m1)}-01`, a: `${anno}-${pad(m3)}-${pad(ultimoGiorno(anno, m3))}` };
    }
    return { da, a };
  }, [modo, anno, mese, trimestre, da, a]);

  const valido = !!periodo.da && !!periodo.a && periodo.da <= periodo.a;

  async function scarica() {
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/ore/export-excel?${new URLSearchParams(periodo)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Errore nell'esportazione");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `Ore_${periodo.da}_${periodo.a}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: "var(--color-grey-light, #E0DED8)" }}>
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Una riga per ogni registrazione: Commessa · ODP · Operatore · Data · Ore · Interno/Esterno
        (più azienda, reparto, categoria e rifacimento). Le causali di stabilimento restano senza commessa.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block mb-1 font-medium">Periodo</span>
          <select className={`${inputCls} h-10`} value={modo} onChange={e => setModo(e.target.value as Modo)}>
            <option value="mese">Mese</option>
            <option value="trimestre">Trimestre</option>
            <option value="intervallo">Intervallo personalizzato</option>
          </select>
        </label>

        {modo !== "intervallo" && (
          <label className="text-sm">
            <span className="block mb-1 font-medium">Anno</span>
            <input type="number" className={`${inputCls} h-10 w-24`} value={anno} min={2020} max={2100}
              onChange={e => setAnno(Number(e.target.value))} />
          </label>
        )}
        {modo === "mese" && (
          <label className="text-sm">
            <span className="block mb-1 font-medium">Mese</span>
            <select className={`${inputCls} h-10`} value={mese} onChange={e => setMese(Number(e.target.value))}>
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
        )}
        {modo === "trimestre" && (
          <label className="text-sm">
            <span className="block mb-1 font-medium">Trimestre</span>
            <select className={`${inputCls} h-10`} value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
              <option value={1}>1° (gen–mar)</option>
              <option value={2}>2° (apr–giu)</option>
              <option value={3}>3° (lug–set)</option>
              <option value={4}>4° (ott–dic)</option>
            </select>
          </label>
        )}
        {modo === "intervallo" && (
          <>
            <label className="text-sm">
              <span className="block mb-1 font-medium">Dal</span>
              <input type="date" className={`${inputCls} h-10`} value={da} onChange={e => setDa(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block mb-1 font-medium">Al</span>
              <input type="date" className={`${inputCls} h-10`} value={a} onChange={e => setA(e.target.value)} />
            </label>
          </>
        )}

        <button
          onClick={scarica}
          disabled={!valido || loading}
          className="h-10 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-primary)" }}
        >
          {loading ? "Esporto…" : "Scarica Excel"}
        </button>
      </div>

      {valido && <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Dal {periodo.da} al {periodo.a}</p>}
      {errore && <p className="text-sm text-red-600">{errore}</p>}
    </div>
  );
}
