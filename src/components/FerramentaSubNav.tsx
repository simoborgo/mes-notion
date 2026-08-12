"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  adminOnly?: boolean;
  // Carico/Scarico messi in evidenza uno accanto all'altro con colori distinti (verde/rosso) —
  // su richiesta esplicita, per riconoscerli a colpo d'occhio dal resto delle voci Ferramenta.
  accent?: "verde" | "rosso";
  // Unica tab visibile a ufficio_tecnico (vista ristretta, vedi soloKitCommessa sotto).
  kitCommessa?: boolean;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/ferramenta", label: "Giacenze", match: (p) => p === "/ferramenta" || p.startsWith("/ferramenta/scarico") },
  { href: "/admin/ferramenta", label: "Anagrafica", adminOnly: true, match: (p) => p === "/admin/ferramenta" },
  { href: "/ferramenta/inventario", label: "Inventario", match: (p) => p.startsWith("/ferramenta/inventario") },
  { href: "/ferramenta/carico", label: "Carico", accent: "verde", match: (p) => p === "/ferramenta/carico" },
  { href: "/ferramenta/scarichi", label: "Scarico", accent: "rosso", match: (p) => p.startsWith("/ferramenta/scarichi") },
  { href: "/ferramenta/fogli-scarico", label: "Fogli di Scarico", match: (p) => p.startsWith("/ferramenta/fogli-scarico") },
  { href: "/ferramenta/kit-commessa", label: "Kit Commessa", kitCommessa: true, match: (p) => p.startsWith("/ferramenta/kit-commessa") },
  { href: "/ferramenta/ordini-wurth", label: "Ordini Wurth", adminOnly: true, match: (p) => p.startsWith("/ferramenta/ordini-wurth") },
];

const ACCENT_STYLE = {
  verde: { active: { background: "#166534", color: "white" }, inactive: { background: "white", color: "#166534", border: "1px solid #86EFAC" } },
  rosso: { active: { background: "#DC2626", color: "white" }, inactive: { background: "white", color: "#DC2626", border: "1px solid #FCA5A5" } },
};

// soloKitCommessa: vista ristretta per ufficio_tecnico — vede solo la tab Kit Commessa
// (unica sezione Ferramenta a cui ha accesso), nessun'altra voce.
export default function FerramentaSubNav({ canManage, soloKitCommessa }: { canManage: boolean; soloKitCommessa?: boolean }) {
  const pathname = usePathname();
  const tabs = soloKitCommessa
    ? TABS.filter((t) => t.kitCommessa)
    : TABS.filter((t) => !t.adminOnly || canManage);

  return (
    <div className="flex flex-wrap gap-2 pb-3 mb-1 border-b" style={{ borderColor: "#E4E0DA" }}>
      {tabs.map((t) => {
        const active = t.match(pathname);
        const style = t.accent
          ? (active ? ACCENT_STYLE[t.accent].active : ACCENT_STYLE[t.accent].inactive)
          : (active
            ? { background: "var(--color-primary)", color: "white" }
            : { background: "white", color: "var(--color-grey-mid)", border: "1px solid #E4E0DA" });
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={style}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
