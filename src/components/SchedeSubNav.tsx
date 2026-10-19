"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  soloKpi?: boolean;
}

const TABS: Tab[] = [
  { href: "/schede", label: "Tutte le Schede", match: (p) => p === "/schede" },
  { href: "/schede/lavorazioni-esterne", label: "Lavorazioni Esterne", match: (p) => p.startsWith("/schede/lavorazioni-esterne") },
  { href: "/schede/kpi-produzione", label: "KPI Produzione", match: (p) => p.startsWith("/schede/kpi-produzione"), soloKpi: true },
];

// La tab KPI mostra costi del lavoro: visibile solo a chi può aprire la dashboard (KPI_PRODUZIONE_ROLES).
export default function SchedeSubNav({ mostraKpi = false }: { mostraKpi?: boolean }) {
  const pathname = usePathname();

  return (
    <div className="no-print flex flex-wrap gap-2 pb-3 mb-1 border-b" style={{ borderColor: "#E4E0DA" }}>
      {TABS.filter((t) => !t.soloKpi || mostraKpi).map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={
              active
                ? { background: "var(--color-primary)", color: "white" }
                : { background: "white", color: "var(--color-grey-mid)", border: "1px solid #E4E0DA" }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
