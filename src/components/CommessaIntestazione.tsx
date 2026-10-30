"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Commessa } from "@/lib/types";
import { COMMESSE_ROLES, type Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import FormCommessa from "./FormCommessa";

// Testata della scheda commessa a pagina piena: percorso, titolo, stato, Modifica. Esc torna
// all'elenco come nella scheda ODP, tranne quando si scrive in un campo o un modale è aperto.
export default function CommessaIntestazione({ commessa, userRole }: { commessa: Commessa; userRole?: Role }) {
  const router = useRouter();
  const [modifica, setModifica] = useState(false);
  const canWrite = !!userRole && COMMESSE_ROLES.includes(userRole);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (document.querySelector(".fixed.inset-0")) return;
      router.push("/commesse");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <nav className="flex items-center gap-2 text-[13.2px]" style={{ color: "var(--color-grey-mid)" }} aria-label="Percorso">
        <Link href="/commesse" className="hover:underline">← Commesse</Link>
        <span>/</span>
        <span className="font-semibold" style={{ color: "var(--color-black)" }}>{commessa.numeroCommessa}</span>
        <span className="ml-auto hidden sm:inline">Esc torna all&apos;elenco</span>
      </nav>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {commessa.numeroCommessa} — {commessa.cliente}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            {[commessa.localita, commessa.responsabile && `Resp. ${commessa.responsabile}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href={`/commesse/${commessa.id}/disegni`} className="text-sm underline" style={{ color: "var(--color-primary)" }}>
            Arrivo disegni
          </Link>
          {canWrite && (
            <button type="button" onClick={() => setModifica(true)} className="text-sm px-3 py-1.5 rounded border font-medium hover:bg-gray-50" style={{ borderColor: "#E4E0DA" }}>
              Modifica
            </button>
          )}
          <BadgeStato stato={commessa.stato} />
        </div>
      </div>
      {modifica && (
        <FormCommessa
          commessa={commessa}
          onClose={() => setModifica(false)}
          onSaved={() => { setModifica(false); router.refresh(); }}
        />
      )}
    </>
  );
}
