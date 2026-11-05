"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Scheda, CommessaScadenza } from "@/lib/types";
import type { Role } from "@/lib/roles";
import type { VoceAttivita } from "@/lib/audit";
import DettaglioSchedaModal from "./DettaglioSchedaModal";

export type TabScheda = "info" | "fornitore" | "kit" | "aps" | "verniciatura";

export default function SchedaPagina({ scheda: iniziale, figlie, attivita, scadenze, padre, hrefPianta, userRole, tabIniziale, modificaIniziale }: {
  scheda: Scheda;
  padre: Scheda | null;
  hrefPianta?: string; // zona di questo ODP su una pianta di commessa
  figlie: Scheda[];
  attivita: VoceAttivita[];
  scadenze: CommessaScadenza[]; // scadenze aperte di commessa legate a questo ODP
  userRole?: Role;
  tabIniziale?: TabScheda;
  modificaIniziale?: boolean;
}) {
  const router = useRouter();
  const [scheda, setScheda] = useState(iniziale);

  // Esc risale di un livello: dalla sottoscheda alla madre, dalla madre all'elenco, come chiude il modale. Non quando si sta scrivendo in un campo o un
  // altro modale (modifica, nuova sottoscheda) è aperto sopra la pagina.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (document.querySelector(".fixed.inset-0")) return;
      router.push(padre ? `/schede/${padre.id}` : "/schede");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, padre]);

  // La tab aperta resta nell'indirizzo (?tab=): ricaricando la pagina o tornando indietro dal
  // browser si ritrova la stessa tab. replaceState non aggiunge voci alla cronologia.
  function cambiaTab(tab: TabScheda) {
    const url = new URL(window.location.href);
    if (tab === "info") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-3 max-w-[1500px] mx-auto">
      <nav className="flex items-center gap-2 text-[13.2px]" style={{ color: "var(--color-grey-mid)" }} aria-label="Percorso">
        <Link href="/schede" className="hover:underline">← Schede</Link>
        <span>/</span>
        {padre && (
          <>
            <Link href={`/schede/${padre.id}`} className="hover:underline">{padre.odp || padre.numeroScheda}</Link>
            <span>/</span>
          </>
        )}
        <span className="font-semibold" style={{ color: "var(--color-black)" }}>{scheda.odp || scheda.numeroScheda || "Scheda"}</span>
        {hrefPianta && <Link href={hrefPianta} className="ml-3 underline" style={{ color: "var(--color-primary)" }}>Vedi sulla pianta</Link>}
        <span className="ml-auto hidden sm:inline">Esc {padre ? `torna a ${padre.odp || padre.numeroScheda}` : "torna all'elenco"}</span>
      </nav>
      <DettaglioSchedaModal
        modalita="pagina"
        scheda={scheda}
        figlie={figlie}
        attivita={attivita}
        scadenze={scadenze}
        userRole={userRole}
        tabIniziale={tabIniziale}
        modificaIniziale={modificaIniziale}
        onTabChange={cambiaTab}
        onClose={() => router.push(padre ? `/schede/${padre.id}` : "/schede")}
        onViewScheda={(s) => router.push(`/schede/${s.id}`)}
        onRilavorazioneCreata={() => router.refresh()}
        onSchedaAggiornata={(updated) => { setScheda(updated); router.refresh(); }}
      />
    </div>
  );
}
