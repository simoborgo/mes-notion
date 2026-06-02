"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/schede", label: "Schede di Produzione" },
  { href: "/ritiri", label: "Ritiri e Consegne" },
  { href: "/commesse", label: "Commesse" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ background: "var(--color-black)", borderColor: "#2a2724" }}
    >
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
        <span
          className="text-lg font-semibold tracking-wide"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)" }}
        >
          MES Dashboard
        </span>

        <nav className="flex gap-1">
          {links.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
                style={{
                  color: active ? "var(--color-primary)" : "var(--color-grey-icon)",
                  background: active ? "rgba(240,143,37,0.12)" : "transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
