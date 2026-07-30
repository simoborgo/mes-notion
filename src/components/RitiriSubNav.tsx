"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  hiddenPerMagazziniere?: boolean;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/ritiri", label: "Ritiri e Consegne", match: (p) => p === "/ritiri" },
  { href: "/rientro-qualita", label: "Rientro Qualità", hiddenPerMagazziniere: true, match: (p) => p.startsWith("/rientro-qualita") },
];

export default function RitiriSubNav({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => !t.hiddenPerMagazziniere || userRole !== "magazziniere");

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
