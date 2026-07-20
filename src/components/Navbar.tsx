"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, ReactNode } from "react";

function NavTab({
  href,
  active,
  icon,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
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

const ALL_ROLES = ["admin", "operatore", "logistica", "spedizioni", "produzione"];
const CARICO_ROLES = ["admin", "produzione"];
const SPEDIZIONI_ROLES = ["admin", "spedizioni"];

const links = [
  {
    href: "/commesse",
    label: "Commesse",
    roles: ALL_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/schede",
    label: "Schede di Produzione (ODP)",
    roles: ALL_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    href: "/ritiri",
    label: "Ritiri e Consegne",
    roles: ALL_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" /><rect x="9" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="16" r="1" /><circle cx="20" cy="16" r="1" />
      </svg>
    ),
  },
  {
    href: "/carico",
    label: "Carico Magazzino",
    roles: CARICO_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
  {
    href: "/spedizioni",
    label: "Spedizione Merci",
    roles: SPEDIZIONI_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1"/>
        <path d="M16 8h4l3 5v3h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
];

interface NavbarProps {
  userName?: string;
  userRole?: string;
}

export default function Navbar({ userName, userRole }: NavbarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() {
    fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  const isAdmin = userRole === "admin";
  const visibleLinks = links.filter(l => !userRole || l.roles.includes(userRole));

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
          {visibleLinks.map(({ href, label, icon }) => (
            <NavTab key={href} href={href} active={pathname === href || pathname.startsWith(href + "/")} icon={icon}>
              {label}
            </NavTab>
          ))}
          {isAdmin && (
            <>
              <NavTab
                href="/admin/import"
                active={pathname === "/admin/import"}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                }
              >
                Import Schede
              </NavTab>
              <NavTab
                href="/admin/log"
                active={pathname === "/admin/log"}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                }
              >
                Audit Log
              </NavTab>
            </>
          )}
        </nav>

        {/* User info + Logout — solo desktop */}
        <div className="hidden md:flex items-center gap-2">
          {userName && (
            <span className="text-xs px-2 py-1 rounded" style={{ color: "#9ca3af", background: "#1a1816" }}>
              {userName}
              {isAdmin && (
                <span className="ml-1.5 text-xs font-medium" style={{ color: "#6366f1" }}>admin</span>
              )}
            </span>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium"
            style={{ color: "#6b6966", border: "1px solid #2a2724" }}
            title="Esci"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Esci
          </button>
        </div>

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
          {visibleLinks.map(({ href, label, icon }) => (
            <NavTab key={href} href={href} active={pathname === href || pathname.startsWith(href + "/")} icon={icon} onClick={() => setMenuOpen(false)}>
              {label}
            </NavTab>
          ))}
          {isAdmin && (
            <>
              <NavTab
                href="/admin/import"
                active={pathname === "/admin/import"}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                }
              >
                Import Schede
              </NavTab>
              <NavTab
                href="/admin/log"
                active={pathname === "/admin/log"}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                }
              >
                Audit Log
              </NavTab>
            </>
          )}
          <div className="px-4 py-2 border-t" style={{ borderColor: "#2a2724" }}>
            {userName && (
              <p className="text-xs mb-2" style={{ color: "#9ca3af" }}>
                {userName}{isAdmin && <span className="ml-1" style={{ color: "#6366f1" }}>· admin</span>}
              </p>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm w-full py-1"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Esci
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
