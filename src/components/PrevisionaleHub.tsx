"use client";

import { useState } from "react";
import type { Offerta } from "@/lib/offerteRepository";
import type { Operatore } from "@/lib/types";
import type { ParametriReparto } from "@/lib/parametriRepartoRepository";
import VistaPrevisionale from "./VistaPrevisionale";
import CostoManodoperaForm from "./CostoManodoperaForm";
import TabellaParametriReparto from "./TabellaParametriReparto";
import TabellaOperatori from "./TabellaOperatori";
import ListaOfferte from "./ListaOfferte";

type Tab = "previsionale" | "parametri" | "offerte";

const TABS: { value: Tab; label: string }[] = [
  { value: "previsionale", label: "Previsionale" },
  { value: "parametri", label: "Parametri Reparto" },
  { value: "offerte", label: "Offerte" },
];

export default function PrevisionaleHub({
  risultatoIniziale, mesiOrizzonte, filtroIniziale,
  parametriReparto, costoOrarioManodopera, operatori,
  offerte, tabIniziale,
}: {
  risultatoIniziale: Parameters<typeof VistaPrevisionale>[0]["risultatoIniziale"];
  mesiOrizzonte: string[];
  filtroIniziale: Parameters<typeof VistaPrevisionale>[0]["filtroIniziale"];
  parametriReparto: ParametriReparto[];
  costoOrarioManodopera: number;
  operatori: Operatore[];
  offerte: Offerta[];
  tabIniziale: Tab;
}) {
  const [tab, setTab] = useState<Tab>(tabIniziale);

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "#F5F2EE" }}>
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-5 py-2.5 text-base font-semibold rounded-lg transition-all"
            style={tab === t.value
              ? { background: "var(--color-primary)", color: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }
              : { background: "transparent", color: "var(--color-grey-mid)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "previsionale" && (
        <VistaPrevisionale risultatoIniziale={risultatoIniziale} mesiOrizzonte={mesiOrizzonte} filtroIniziale={filtroIniziale} />
      )}

      {tab === "parametri" && (
        <div className="space-y-5">
          <CostoManodoperaForm costoIniziale={costoOrarioManodopera} />
          <TabellaParametriReparto parametriIniziali={parametriReparto} />
          <TabellaOperatori operatoriIniziali={operatori} />
        </div>
      )}

      {tab === "offerte" && <ListaOfferte offerte={offerte} />}
    </div>
  );
}
