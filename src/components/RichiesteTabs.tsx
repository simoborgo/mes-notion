"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/ferramenta/fogli-scarico", label: "Per ODP" },
  { href: "/ferramenta/fabbisogno", label: "Fabbisogno (BOM articoli)" },
];

// Selettore a due vie dentro "Richieste Ferramenta ODP": vista per ODP e BOM aggregata per articolo.
export default function RichiesteTabs() {
  const pathname = usePathname();
  return (
    <div className="inline-flex p-1 rounded-xl border" style={{ background: "#F5F2EE", borderColor: "#E4E0DA" }}>
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-5 py-2 rounded-lg text-sm font-bold transition-colors"
            style={active
              ? { background: "var(--color-primary)", color: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }
              : { color: "var(--color-grey-mid)" }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
