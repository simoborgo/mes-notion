"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  adminOnly?: boolean;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/ferramenta", label: "Giacenze", match: (p) => p === "/ferramenta" || p.startsWith("/ferramenta/scarico") },
  { href: "/admin/ferramenta", label: "Anagrafica", adminOnly: true, match: (p) => p === "/admin/ferramenta" },
  { href: "/ferramenta/inventario", label: "Inventario", match: (p) => p.startsWith("/ferramenta/inventario") },
  { href: "/ferramenta/carico", label: "Carico", match: (p) => p === "/ferramenta/carico" },
  { href: "/ferramenta/fogli-scarico", label: "Fogli di Scarico", match: (p) => p.startsWith("/ferramenta/fogli-scarico") },
  { href: "/ferramenta/distinte-scarico", label: "Distinte di Scarico", match: (p) => p.startsWith("/ferramenta/distinte-scarico") },
  { href: "/ferramenta/ordini-wurth", label: "Ordini Wurth", adminOnly: true, match: (p) => p.startsWith("/ferramenta/ordini-wurth") },
];

// soloDistinteScarico: vista ristretta per ufficio_tecnico — vede solo la tab Distinte di
// Scarico (unica sezione Ferramenta a cui ha accesso), nessun'altra voce.
export default function FerramentaSubNav({ canManage, soloDistinteScarico }: { canManage: boolean; soloDistinteScarico?: boolean }) {
  const pathname = usePathname();
  const tabs = soloDistinteScarico
    ? TABS.filter((t) => t.href === "/ferramenta/distinte-scarico")
    : TABS.filter((t) => !t.adminOnly || canManage);

  return (
    <div className="flex flex-wrap gap-2 pb-3 mb-1 border-b" style={{ borderColor: "#E4E0DA" }}>
      {tabs.map((t) => {
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
