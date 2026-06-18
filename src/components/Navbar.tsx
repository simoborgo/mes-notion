"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, ReactNode } from "react";

function NavTab({ href, active, icon, children, onClick }: { href: string; active: boolean; icon: ReactNode; children: ReactNode; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="nav-tab flex items-center gap-2 px-4 text-sm font-medium transition-all"
      data-active={active}
      data-hovered={hovered}
    >
      <span>{icon}</span>
      {children}
    </Link>
  );
}

const links = [
  {
    href: "/commesse",
    label: "Commesse",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/schede",
    label: "Schede di Produzione (ODP)",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    href: "/ritiri",
    label: "Ritiri e Consegne",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" /><rect x="9" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="16" r="1" /><circle cx="20" cy="16" r="1" />
      </svg>
    ),
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() {
    fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-50 border-b" style={{ background: "var(--color-black)", borderColor: "#2a2724" }}>
      <div className="w-full px-4 h-16 flex items-center gap-4">

        {/* Logo + titolo */}
        <div className="flex items-center gap-3 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/modar-logo.png" alt="Modar" style={{ height: 48, width: 48, objectFit: "contain", background: "white", borderRadius: 4, padding: 2 }} />
          <Link href="/" className="text-sm font-semibold uppercase hover:opacity-80 transition-opacity hidden sm:block" style={{ color: "white", letterSpacing: "0.12em" }}>
            MES DASHBOARD v1.1
          </Link>
          <Link href="/" className="text-sm font-semibold uppercase hover:opacity-80 transition-opacity sm:hidden" style={{ color: "white", letterSpacing: "0.08em" }}>
            MES
          </Link>
        </div>

        {/* Separatore — solo desktop */}
        <div className="hidden md:block" style={{ width: 1, height: 28, background: "#2a2724", flexShrink: 0 }} />

        {/* Tab nav — solo desktop */}
        <nav className="hidden md:flex items-stretch flex-1 self-stretch">
          {links.map(({ href, label, icon }) => (
            <NavTab key={href} href={href} active={pathname.startsWith(href)} icon={icon}>
              {label}
            </NavTab>
          ))}
        </nav>

        {/* Logout — solo desktop */}
        <button
          onClick={logout}
          className="hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium"
          style={{ color: "#6b6966", border: "1px solid #2a2724" }}
          title="Esci"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Esci
        </button>

        {/* Hamburger — solo mobile */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="md:hidden ml-auto flex flex-col gap-1.5 p-2"
          aria-label="Menu"
        >
          <span style={{ display: "block", width: 22, height: 2, background: menuOpen ? "transparent" : "white", transition: "all .2s" }} />
          <span style={{ display: "block", width: 22, height: 2, background: "white", transform: menuOpen ? "rotate(45deg) translate(3px,3px)" : "none", transition: "all .2s" }} />
          <span style={{ display: "block", width: 22, height: 2, background: "white", transform: menuOpen ? "rotate(-45deg) translate(3px,-3px)" : "none", transition: "all .2s" }} />
        </button>
      </div>

      {/* Menu mobile a tendina */}
      {menuOpen && (
        <div className="md:hidden border-t" style={{ background: "var(--color-black)", borderColor: "#2a2724" }}>
          {links.map(({ href, label, icon }) => (
            <NavTab key={href} href={href} active={pathname.startsWith(href)} icon={icon} onClick={() => setMenuOpen(false)}>
              {label}
            </NavTab>
          ))}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm border-t"
            style={{ color: "rgba(255,255,255,0.5)", borderColor: "#2a2724" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Esci
          </button>
        </div>
      )}
    </header>
  );
}
