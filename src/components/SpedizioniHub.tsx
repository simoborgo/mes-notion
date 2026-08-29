"use client";

import { useState } from "react";
import type { OdpEntry } from "@/app/api/verifiche/odp-list/route";
import type { Cassa, Commessa, Scheda } from "@/lib/types";
import SpedizioneVerifica from "./SpedizioneVerifica";
import TabellaCasse from "./TabellaCasse";

type Tab = "verifica" | "packing";

const TABS: { value: Tab; label: string }[] = [
  { value: "verifica", label: "Verifica Merci" },
  { value: "packing", label: "Packing List" },
];

export default function SpedizioniHub({
  userName, userRole, odpList, casse, commesse, schede, canWritePacking, tabIniziale,
}: {
  userName: string;
  userRole?: string;
  odpList: OdpEntry[];
  casse: Cassa[];
  commesse: Commessa[];
  schede: Scheda[];
  canWritePacking: boolean;
  tabIniziale: Tab;
}) {
  const [tab, setTab] = useState<Tab>(tabIniziale);

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "#F5F2EE", margin: "24px 20px 0" }}>
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-all"
            style={tab === t.value
              ? { background: "var(--color-primary)", color: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }
              : { background: "transparent", color: "var(--color-grey-mid)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "verifica" && (
        <SpedizioneVerifica userName={userName} userRole={userRole} odpList={odpList} />
      )}

      {tab === "packing" && (
        <div style={{ padding: "0 20px 24px" }}>
          <TabellaCasse casse={casse} commesse={commesse} schede={schede} canWrite={canWritePacking} />
        </div>
      )}
    </div>
  );
}
