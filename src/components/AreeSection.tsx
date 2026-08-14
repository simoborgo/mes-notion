"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Area, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormArea from "./FormArea";

export default function AreeSection({
  commessaId, areeIniziali, schede, userRole,
}: {
  commessaId: string;
  areeIniziali: Area[];
  schede: Scheda[];
  userRole?: string;
}) {
  const router = useRouter();
  const [aree, setAree] = useState(areeIniziali);
  const [formAperto, setFormAperto] = useState<"nuova" | Area | null>(null);
  // COMMESSE_ROLES (src/lib/auth.ts) — tenuto in sync a mano, stesso pattern di TabellaCommesse.
  const canWrite = userRole === "admin" || userRole === "produzione";

  function handleSaved(aggiornata: Area) {
    setAree(prev => {
      const esiste = prev.some(a => a.id === aggiornata.id);
      return esiste ? prev.map(a => (a.id === aggiornata.id ? aggiornata : a)) : [...prev, aggiornata];
    });
    setFormAperto(null);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Aree / Cartelle ({aree.length})
        </h2>
        {canWrite && (
          <button
            onClick={() => setFormAperto("nuova")}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
            style={{ background: "var(--color-primary)" }}
          >
            + Nuova Area
          </button>
        )}
      </div>
      {aree.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna area collegata.</p>
      ) : (
        <div className="space-y-3">
          {aree.map((area) => {
            // Calcolato dalle schede reali dell'area, non da un campo "Completamento" salvato
            // — mai scritto da nessuna parte del codice (vedi schema_commesse.sql).
            const schedeArea = schede.filter((s) => s.areaId === area.id);
            const pct = schedeArea.length > 0
              ? Math.round((schedeArea.filter(s => s.statoProduzione === "Completato").length / schedeArea.length) * 100)
              : null;
            return (
              <div key={area.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{area.nomeArredo || "—"}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                      {area.localitaCliente} {area.posizione ? `— ${area.posizione}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 items-start">
                    <BadgeStato stato={area.statoProduzione} />
                    <BadgeStato stato={area.statoCommessa} />
                    {canWrite && (
                      <button
                        onClick={() => setFormAperto(area)}
                        className="text-xs px-2 py-1 rounded font-medium hover:bg-gray-100 transition-colors"
                        style={{ color: "var(--color-grey-mid)" }}
                      >
                        Modifica
                      </button>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1" style={{ color: "var(--color-grey-mid)" }}>
                      <span>Completamento</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, background: "var(--color-primary)" }}
                      />
                    </div>
                  </div>
                )}
                {area.note && (
                  <p className="text-xs mt-2" style={{ color: "var(--color-grey-mid)" }}>{area.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {formAperto && (
        <FormArea
          commessaId={commessaId}
          area={formAperto === "nuova" ? undefined : formAperto}
          onClose={() => setFormAperto(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
