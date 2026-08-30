"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/schede", label: "Tutte le Schede", match: (p) => p === "/schede" },
  { href: "/schede/lavorazioni-esterne", label: "Lavorazioni Esterne", match: (p) => p.startsWith("/schede/lavorazioni-esterne") },
];

export default function SchedeSubNav() {
  const pathname = usePathname();

  return (
    <div className="no-print flex flex-wrap gap-2 pb-3 mb-1 border-b" style={{ borderColor: "#E4E0DA" }}>
      {TABS.map((t) => {
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
