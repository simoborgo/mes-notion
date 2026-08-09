"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/verniciatura", label: "Vernici", match: (p) => p === "/verniciatura" },
  { href: "/verniciatura/cicli", label: "Cicli", match: (p) => p.startsWith("/verniciatura/cicli") },
  { href: "/verniciatura/campionature", label: "Campionature", match: (p) => p.startsWith("/verniciatura/campionature") },
];

// Stessa struttura "segmented pill" di OreSubNav (adatta a più tab di quante ne regga il
// pattern flat di FerramentaSubNav), ma con accent colorato invece del solo arancione primary
// — sezione volutamente "un po' più colorata" del resto del MES, su richiesta esplicita.
export default function VerniciaturaSubNav() {
  const pathname = usePathname();
  return (
    <div className="inline-flex gap-1 p-1 rounded-xl flex-wrap mb-5" style={{ background: "#F5F2EE" }}>
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all"
            style={
              active
                ? { background: "linear-gradient(135deg, #7C3AED, #DB2777)", color: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }
                : { background: "transparent", color: "var(--color-grey-mid)" }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
