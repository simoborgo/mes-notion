"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
}

const TABS: Tab[] = [
  {
    href: "/admin/impostazioni/audit-log",
    label: "Audit Log",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/admin/impostazioni/pin-operatori",
    label: "PIN Operatori",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    href: "/admin/impostazioni/orari-turno",
    label: "Orari Turno",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    href: "/admin/impostazioni/fornitori",
    label: "Fornitori",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
];

// Tab "a cartellina" in stile ERP gestionale (striscia grigia + tab attiva che "sale" e si
// fonde col pannello bianco sottostante) — deliberatamente diverso dai pattern "pill"/"capsule"
// usati altrove (OreSubNav, VerniciaturaSubNav, FerramentaSubNav): qui il risultato deve leggersi
// come vere tab di un applicativo gestionale, non come filtri. Un solo componente (non un
// XxxSubNav + markup duplicato in ogni pagina) perché le 3 pagine condividono anche il pannello,
// non solo la striscia tab.
export default function ImpostazioniLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-black)" }}>
          Impostazioni
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Amministrazione e configurazione del sistema
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E4E0DA", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div className="flex flex-wrap" style={{ background: "#EDE9E3", borderBottom: "1px solid #E4E0DA" }}>
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all"
                style={
                  active
                    ? { background: "white", color: "var(--color-black)", borderTop: "2px solid var(--color-primary)", marginBottom: -1 }
                    : { background: "transparent", color: "var(--color-grey-mid)", borderTop: "2px solid transparent", marginBottom: -1 }
                }
              >
                <span style={{ color: active ? "var(--color-primary)" : "currentColor" }}>{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
        <div style={{ background: "white" }} className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
