"use client";

import Link from "next/link";

const TABS = [
  { href: "/ore", key: "oggi", label: "Oggi" },
  { href: "/ore/rifacimenti", key: "rifacimenti", label: "Rifacimenti da Classificare" },
  { href: "/ore/storico-odp", key: "storico-odp", label: "Storico ODP" },
  { href: "/ore/storico-operatore", key: "storico-operatore", label: "Storico Operatore" },
  { href: "/ore/kpi", key: "kpi", label: "Dashboard KPI" },
];

export default function OreSubNav({ active }: { active: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-0 mb-5 border-b" style={{ borderColor: "#e5e4e0" }}>
      {TABS.map(t => (
        <Link
          key={t.key}
          href={t.href}
          className="px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors"
          style={{
            color: active === t.key ? "var(--color-primary)" : "var(--color-grey-mid)",
            borderBottom: active === t.key ? "2px solid var(--color-primary)" : "2px solid transparent",
            marginBottom: -1,
          }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
