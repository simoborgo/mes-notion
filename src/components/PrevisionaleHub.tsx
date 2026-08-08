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
      <div className="flex gap-1 border-b" style={{ borderColor: "#e5e4e0" }}>
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors"
            style={tab === t.value
              ? { borderColor: "var(--color-primary)", color: "var(--color-primary)" }
              : { borderColor: "transparent", color: "var(--color-grey-mid)" }}
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
