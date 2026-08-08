"use client";

import Link from "next/link";
import type { Offerta } from "@/lib/offerteRepository";
import FormNuovaOfferta from "./FormNuovaOfferta";

const STATO_BADGE: Record<string, { bg: string; color: string }> = {
  Offerta: { bg: "#FEF3C7", color: "#92400E" },
  Confermata: { bg: "#DCFCE7", color: "#166534" },
  Persa: { bg: "#F3F4F6", color: "#6B7280" },
};

function fmtData(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("it-IT");
}

export default function ListaOfferte({ offerte }: { offerte: Offerta[] }) {
  return (
    <div className="space-y-4">
      <FormNuovaOfferta />

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
        {offerte.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--color-grey-mid)" }}>Nessuna offerta</p>
        ) : (
          offerte.map(o => {
            const badge = STATO_BADGE[o.stato];
            return (
              <Link
                key={o.id}
                href={`/offerte/${o.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-0 hover:bg-gray-50"
                style={{ borderColor: "#f0ece5" }}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "var(--color-black)" }}>{o.cliente}</p>
                  <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                    {fmtData(o.dataOfferta)}{o.valoreCommessa != null ? ` · €${o.valoreCommessa.toLocaleString("it-IT")}` : ""} · {o.probabilitaChiusura}% probabilità
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: badge.bg, color: badge.color }}>
                  {o.stato}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
