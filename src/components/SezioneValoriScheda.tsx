"use client";

import { useState } from "react";
import { costoDaVendita, venditaDaCosto, euroDaOre, oreDaEuro, PCT_COSTO_SU_VENDITA } from "@/lib/valoriScheda";

const inputCls = "w-full text-[15.4px] px-3 py-1.5 rounded-md border focus:outline-none focus:ring-2 focus:ring-orange-300 transition-shadow bg-white";
const inputStyle = { border: "1px solid #e5e4e0", color: "var(--color-black)" };

function Box({ label, modificato, children }: { label: string; modificato: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2 min-w-0"
      style={{ background: modificato ? "#FFF7ED" : "white", border: `1px solid ${modificato ? "var(--color-primary)" : "#e5e4e0"}` }}>
      <label className="block text-[12.1px] font-semibold mb-1" style={{ color: "var(--color-grey-mid)" }}>{label}</label>
      {children}
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const fmt = (n: number | null) => (n == null || !Number.isFinite(n) ? "" : String(n));

type Campo = "vendita" | "costo" | "euro" | "ore";

// Valori economici della scheda. Si salvano solo vendita (€) e ore di manodopera: costo e
// manodopera in € sono derivati (60% e tariffa oraria). admin=null -> solo le ore (gli importi
// li vede e li imposta solo l'admin).
export default function SezioneValoriScheda({ admin, vendita, ore, venditaIniziale, oreIniziali, onVendita, onOre }: {
  admin: { tariffa: number } | null;
  vendita: number | null;
  ore: number | null;
  venditaIniziale: number | null;
  oreIniziali: number | null;
  onVendita: (v: number | null) => void;
  onOre: (v: number | null) => void;
}) {
  // Testo in digitazione del campo che si sta scrivendo: evita che il valore ricalcolato
  // riscriva a metà ciò che l'utente digita ("1000." diventerebbe "1000"). Gli altri campi si derivano.
  const [bozza, setBozza] = useState<{ campo: Campo; testo: string } | null>(null);
  const [manodoperaInEuro, setManodoperaInEuro] = useState(false);
  const tariffa = admin?.tariffa ?? 0;

  const mostra = (campo: Campo, calcolato: string) => (bozza?.campo === campo ? bozza.testo : calcolato);
  const scrivi = (campo: Campo, testo: string, applica: (n: number | null) => void) => {
    setBozza({ campo, testo });
    applica(num(testo));
  };

  const euroManodopera = ore != null ? euroDaOre(ore, tariffa) : null;

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
      {admin && (
        <>
          <Box label="Valore di vendita (€)" modificato={vendita !== venditaIniziale}>
            <input type="text" inputMode="decimal" className={inputCls} style={inputStyle}
              value={mostra("vendita", fmt(vendita))}
              onChange={(e) => scrivi("vendita", e.target.value, onVendita)} onBlur={() => setBozza(null)} />
          </Box>
          <Box label={`Costo (€) · ${Math.round(PCT_COSTO_SU_VENDITA * 100)}% della vendita`} modificato={vendita !== venditaIniziale}>
            <input type="text" inputMode="decimal" className={inputCls} style={inputStyle}
              value={mostra("costo", vendita != null ? fmt(costoDaVendita(vendita)) : "")}
              onChange={(e) => scrivi("costo", e.target.value, (c) => onVendita(c == null ? null : venditaDaCosto(c)))}
              onBlur={() => setBozza(null)} />
          </Box>
        </>
      )}
      <Box label={admin && manodoperaInEuro ? "Manodopera prevista (€)" : "Manodopera prevista (ore)"} modificato={ore !== oreIniziali}>
        <div className="flex items-center gap-2">
          {admin && manodoperaInEuro ? (
            <input type="text" inputMode="decimal" className={inputCls} style={inputStyle}
              value={mostra("euro", fmt(euroManodopera))}
              onChange={(e) => scrivi("euro", e.target.value, (e2) => onOre(e2 == null ? null : oreDaEuro(e2, tariffa)))}
              onBlur={() => setBozza(null)} />
          ) : (
            <input type="text" inputMode="decimal" className={inputCls} style={inputStyle}
              value={mostra("ore", fmt(ore))}
              onChange={(e) => scrivi("ore", e.target.value, onOre)} onBlur={() => setBozza(null)} />
          )}
          {admin && (
            <button type="button" disabled={tariffa <= 0}
              onClick={() => { setBozza(null); setManodoperaInEuro((v) => !v); }}
              title={tariffa > 0 ? `Tariffa oraria: ${tariffa} €/h` : "Tariffa oraria non impostata (Impostazioni)"}
              className="shrink-0 text-[13.2px] font-semibold px-2.5 py-1.5 rounded-md border disabled:opacity-50"
              style={{ border: "1px solid #e5e4e0", background: "#f8f7f5" }}>
              {manodoperaInEuro ? "€ → h" : "h → €"}
            </button>
          )}
        </div>
        {admin && ore != null && tariffa > 0 && (
          <p className="text-[12.1px] mt-1" style={{ color: "var(--color-grey-mid)" }}>
            {manodoperaInEuro ? `= ${fmt(ore)} h` : `= ${fmt(euroManodopera)} €`} a {tariffa} €/h
          </p>
        )}
      </Box>
    </div>
  );
}
