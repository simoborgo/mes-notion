"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, ReactNode } from "react";
import {
  type Role,
  ALL_ROLES,
  CARICO_ROLES,
  SPEDIZIONI_ROLES,
  RILEVAMENTO_ORE_ROLES,
  KIT_COMMESSA_CREA_ROLES,
  SCARICO_MATERIALE_ROLES,
  VERNICIATURA_ROLES,
  MAGAZZINO_VERNICI_ROLES,
  MAGAZZINO_BORDI_ROLES,
  MAGAZZINO_LEGNO_ROLES,
  MAGAZZINO_TRANCIATI_ROLES,
  MAGAZZINO_PROFILI_METALLICI_ROLES,
  APS_GANTT_ROLES,
} from "@/lib/roles";

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

// Menu a tendina desktop per le voci solo-admin — raggruppate qui (2026-08-09) perché con tutte
// e 15 le voci (9 sezioni base + 5 admin + Guida) la nav bar principale usciva dai limiti
// orizzontali: nessun wrap/scroll sulla riga `flex items-stretch flex-1`. Il menu mobile resta
// invece piatto (stessa lista ADMIN_LINKS sotto): lì le voci si impilano verticalmente, non c'è
// overflow da risolvere e un livello di click in più sarebbe solo peggiorativo.
function NavDropdown({ label, icon, active, children }: { label: string; icon: ReactNode; active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative flex items-stretch" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="nav-tab flex items-center gap-2 px-4 text-sm font-medium transition-all"
        data-active={active || open}
        data-hovered={hovered}
      >
        <span>{icon}</span>
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg overflow-hidden shadow-lg z-50"
          style={{ background: "var(--color-black)", border: "1px solid #2a2724", minWidth: 220 }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function NavDropdownItem({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
      style={{ color: active ? "white" : "#9ca3af" }}
    >
      <span>{icon}</span>
      {children}
    </Link>
  );
}

// Manuale MES: pagine HTML statiche servite da /public, non fanno parte del
// routing dell'app — link normale in una nuova scheda invece di next/link.
function NavTabExternal({ href, icon, children, onClick }: { href: string; icon: ReactNode; children: ReactNode; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="nav-tab flex items-center gap-2 px-4 text-sm font-medium transition-all"
      data-active={false}
      data-hovered={hovered}
    >
      <span>{icon}</span>
      {children}
    </a>
  );
}

const GUIDA_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

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
    href: "/aps",
    label: "Pianificazione (APS)",
    roles: APS_GANTT_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="12" height="4" rx="1" /><rect x="3" y="16" width="15" height="4" rx="1" />
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
    href: "/scarico-materiale",
    label: "Scarico Materiale",
    roles: SCARICO_MATERIALE_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><line x1="12" y1="2" x2="12" y2="14" />
      </svg>
    ),
  },
  {
    href: "/ore",
    label: "Rilevamento Ore",
    roles: RILEVAMENTO_ORE_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    href: "/ferramenta",
    label: "Ferramenta",
    // Include ufficio_tecnico: vede solo la voce, la pagina /ferramenta root lo rimanda dritto a
    // /ferramenta/kit-commessa (nessun accesso a giacenze/anagrafica/altro).
    roles: KIT_COMMESSA_CREA_ROLES,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.12 15.88" /><path d="M14.47 14.48L20 20" /><path d="M8.12 8.12L12 12" />
      </svg>
    ),
  },
  {
    href: "/verniciatura",
    label: "Verniciatura",
    // Include anche MAGAZZINO_VERNICI_ROLES: chi ha solo magazziniere_vernici deve vedere questa
    // voce per arrivare alla tab Magazzino, anche senza accesso a Cicli/Campionature.
    roles: [...VERNICIATURA_ROLES, ...MAGAZZINO_VERNICI_ROLES],
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2H8a2 2 0 0 0-2 2v3h14V4a2 2 0 0 0-2-2z" /><path d="M6 7h14v4H6z" /><path d="M10 11v4a2 2 0 0 0 2 2 2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a2 2 0 0 1 2-2" />
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
  userRole?: Role;
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

  // Magazzino ▾: dropdown per le categorie sul motore di magazzino generico condiviso (Bordi,
  // Legname, Tranciati, Profili Metallici — Collanti restano dentro Ferramenta). Una singola voce
  // finché c'era solo Bordi (vedi PROSSIME_IMPLEMENTAZIONI.md), ora raggruppate come "Amministrazione ▾"
  // — ogni sottovoce filtrata dal proprio ruolo, così un magazziniere di una sola categoria vede
  // solo quella.
  const canMagazzinoBordi = !!userRole && MAGAZZINO_BORDI_ROLES.includes(userRole);
  const canMagazzinoLegno = !!userRole && MAGAZZINO_LEGNO_ROLES.includes(userRole);
  const canMagazzinoTranciati = !!userRole && MAGAZZINO_TRANCIATI_ROLES.includes(userRole);
  const canMagazzinoProfiliMetallici = !!userRole && MAGAZZINO_PROFILI_METALLICI_ROLES.includes(userRole);
  const canMagazzino = canMagazzinoBordi || canMagazzinoLegno || canMagazzinoTranciati || canMagazzinoProfiliMetallici;

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
          {canMagazzino && (
            <NavDropdown
              label="Magazzino"
              active={pathname.startsWith("/magazzino/")}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
                </svg>
              }
            >
              {canMagazzinoBordi && (
                <NavDropdownItem
                  href="/magazzino/bordi"
                  active={pathname.startsWith("/magazzino/bordi")}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />
                    </svg>
                  }
                >
                  Bordi
                </NavDropdownItem>
              )}
              {canMagazzinoLegno && (
                <NavDropdownItem
                  href="/magazzino/legno"
                  active={pathname.startsWith("/magazzino/legno")}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M12 22V12" /><path d="m3 7 9 5 9-5" />
                    </svg>
                  }
                >
                  Legname
                </NavDropdownItem>
              )}
              {canMagazzinoTranciati && (
                <NavDropdownItem
                  href="/magazzino/tranciati"
                  active={pathname.startsWith("/magazzino/tranciati")}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" />
                    </svg>
                  }
                >
                  Tranciati
                </NavDropdownItem>
              )}
              {canMagazzinoProfiliMetallici && (
                <NavDropdownItem
                  href="/magazzino/profili-metallici"
                  active={pathname.startsWith("/magazzino/profili-metallici")}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                    </svg>
                  }
                >
                  Profili Metallici
                </NavDropdownItem>
              )}
            </NavDropdown>
          )}
          {isAdmin && (
            <NavDropdown
              label="Amministrazione"
              active={
                pathname === "/previsionale" || pathname.startsWith("/offerte") ||
                pathname === "/admin/import" || pathname.startsWith("/admin/ferramenta/kit") ||
                pathname.startsWith("/admin/impostazioni") || pathname.startsWith("/admin/reparti") ||
                pathname.startsWith("/admin/articoli") || pathname.startsWith("/admin/pattern-ciclo")
              }
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              }
            >
              <NavDropdownItem
                href="/previsionale"
                active={pathname === "/previsionale" || pathname.startsWith("/offerte")}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.1-2.8-2.8L7 14"/>
                  </svg>
                }
              >
                Previsionale
              </NavDropdownItem>
              <NavDropdownItem
                href="/admin/reparti"
                active={pathname.startsWith("/admin/reparti")}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                }
              >
                Reparti (APS)
              </NavDropdownItem>
              <NavDropdownItem
                href="/admin/articoli"
                active={pathname.startsWith("/admin/articoli")}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7h-3a2 2 0 0 1-2-2V2" /><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l4 4v10a2 2 0 0 1-2 2z" /><path d="M3 8v12a2 2 0 0 0 2 2h10" />
                  </svg>
                }
              >
                Articoli (APS)
              </NavDropdownItem>
              <NavDropdownItem
                href="/admin/pattern-ciclo"
                active={pathname.startsWith("/admin/pattern-ciclo")}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8" /><path d="M8 6h4a4 4 0 0 1 4 4" /><path d="M8 18h4a4 4 0 0 0 4-4" />
                  </svg>
                }
              >
                Pattern Ciclo (APS)
              </NavDropdownItem>
              <NavDropdownItem
                href="/admin/import"
                active={pathname === "/admin/import"}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                }
              >
                Import Schede
              </NavDropdownItem>
              <NavDropdownItem
                href="/admin/ferramenta/kit"
                active={pathname === "/admin/ferramenta/kit" || pathname.startsWith("/admin/ferramenta/kit/")}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                }
              >
                Kit Ferramenta ODP
              </NavDropdownItem>
              <NavDropdownItem
                href="/admin/impostazioni"
                active={pathname.startsWith("/admin/impostazioni")}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                }
              >
                Impostazioni
              </NavDropdownItem>
            </NavDropdown>
          )}
          <NavTabExternal href="/manuale-mes/index.html" icon={GUIDA_ICON}>
            Guida
          </NavTabExternal>
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
          {canMagazzinoBordi && (
            <NavTab
              href="/magazzino/bordi"
              active={pathname.startsWith("/magazzino/bordi")}
              onClick={() => setMenuOpen(false)}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />
                </svg>
              }
            >
              Magazzino Bordi
            </NavTab>
          )}
          {canMagazzinoLegno && (
            <NavTab
              href="/magazzino/legno"
              active={pathname.startsWith("/magazzino/legno")}
              onClick={() => setMenuOpen(false)}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M12 22V12" /><path d="m3 7 9 5 9-5" />
                </svg>
              }
            >
              Magazzino Legname
            </NavTab>
          )}
          {canMagazzinoTranciati && (
            <NavTab
              href="/magazzino/tranciati"
              active={pathname.startsWith("/magazzino/tranciati")}
              onClick={() => setMenuOpen(false)}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" />
                </svg>
              }
            >
              Magazzino Tranciati
            </NavTab>
          )}
          {canMagazzinoProfiliMetallici && (
            <NavTab
              href="/magazzino/profili-metallici"
              active={pathname.startsWith("/magazzino/profili-metallici")}
              onClick={() => setMenuOpen(false)}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              }
            >
              Magazzino Profili Metallici
            </NavTab>
          )}
          {isAdmin && (
            <>
              <NavTab
                href="/previsionale"
                active={pathname === "/previsionale" || pathname.startsWith("/offerte")}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.1-2.8-2.8L7 14"/>
                  </svg>
                }
              >
                Previsionale
              </NavTab>
              <NavTab
                href="/admin/reparti"
                active={pathname.startsWith("/admin/reparti")}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                }
              >
                Reparti (APS)
              </NavTab>
              <NavTab
                href="/admin/articoli"
                active={pathname.startsWith("/admin/articoli")}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7h-3a2 2 0 0 1-2-2V2" /><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l4 4v10a2 2 0 0 1-2 2z" /><path d="M3 8v12a2 2 0 0 0 2 2h10" />
                  </svg>
                }
              >
                Articoli (APS)
              </NavTab>
              <NavTab
                href="/admin/pattern-ciclo"
                active={pathname.startsWith("/admin/pattern-ciclo")}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8" /><path d="M8 6h4a4 4 0 0 1 4 4" /><path d="M8 18h4a4 4 0 0 0 4-4" />
                  </svg>
                }
              >
                Pattern Ciclo (APS)
              </NavTab>
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
                href="/admin/ferramenta/kit"
                active={pathname === "/admin/ferramenta/kit" || pathname.startsWith("/admin/ferramenta/kit/")}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                }
              >
                Kit Ferramenta ODP
              </NavTab>
              <NavTab
                href="/admin/impostazioni"
                active={pathname.startsWith("/admin/impostazioni")}
                onClick={() => setMenuOpen(false)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                }
              >
                Impostazioni
              </NavTab>
            </>
          )}
          <NavTabExternal href="/manuale-mes/index.html" icon={GUIDA_ICON} onClick={() => setMenuOpen(false)}>
            Guida
          </NavTabExternal>
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
