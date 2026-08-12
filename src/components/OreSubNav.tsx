"use client";

import Link from "next/link";

const TABS = [
  { href: "/ore", key: "oggi", label: "Oggi" },
  { href: "/ore/rifacimenti", key: "rifacimenti", label: "Rifacimenti da Classificare" },
  { href: "/ore/segmenti-anomali", key: "segmenti-anomali", label: "Segmenti da Rivedere" },
  { href: "/ore/storico-odp", key: "storico-odp", label: "Storico ODP" },
  { href: "/ore/storico-commessa", key: "storico-commessa", label: "Storico Commessa" },
  { href: "/ore/storico-operatore", key: "storico-operatore", label: "Storico Operatore" },
  { href: "/ore/storico-articolo", key: "storico-articolo", label: "Storico Articolo" },
  { href: "/ore/standard-articoli", key: "standard-articoli", label: "Standard Articoli" },
  { href: "/ore/kpi", key: "kpi", label: "Dashboard KPI" },
];

export default function OreSubNav({ active }: { active: string }) {
  return (
    <div className="inline-flex gap-1 p-1 rounded-xl flex-wrap mb-5" style={{ background: "#F5F2EE" }}>
      {TABS.map(t => (
        <Link
          key={t.key}
          href={t.href}
          className="px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all"
          style={active === t.key
            ? { background: "var(--color-primary)", color: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }
            : { background: "transparent", color: "var(--color-grey-mid)" }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
