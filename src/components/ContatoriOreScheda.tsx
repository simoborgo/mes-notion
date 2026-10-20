"use client";

import { costoDaVendita, euroDaOre, type EconomiaScheda } from "@/lib/valoriScheda";

const fmtOre = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`;
const fmtEuro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Contatore({ etichetta, valore, nota, colore }: { etichetta: string; valore: string; nota?: string; colore: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5 min-w-0" style={{ background: "white", border: "1px solid #ebe9e5" }}>
      <div className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>{etichetta}</div>
      <div className="text-[26px] leading-tight font-bold tabular-nums" style={{ color: colore }}>{valore}</div>
      {nota && <div className="text-[12.1px]" style={{ color: "var(--color-grey-mid)" }}>{nota}</div>}
    </div>
  );
}

// Ore previste / consumate / standard dell'articolo. La barra riempie le ore consumate: i segni
// verticali sono il previsto e lo standard sulla stessa scala. Gli importi in € sono solo admin.
export default function ContatoriOreScheda({ economia, orePreviste }: { economia: EconomiaScheda | null; orePreviste: number | null }) {
  if (!economia) return null;
  const { oreConsumate, oreStandard, admin } = economia;
  const riferimento = orePreviste ?? oreStandard;
  const pct = riferimento && riferimento > 0 ? oreConsumate / riferimento : null;
  const coloreBarra = pct == null ? "var(--color-primary)" : pct > 1.2 ? "#DC2626" : pct > 1 ? "#D97706" : "#16A34A";
  const scalaMax = Math.max(oreConsumate, orePreviste ?? 0, oreStandard ?? 0) * 1.08 || 1;
  const pos = (v: number) => `${Math.min(100, (v / scalaMax) * 100)}%`;

  return (
    <section className="space-y-2">
      <h3 className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Ore</h3>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Contatore etichetta="Previste" valore={orePreviste != null ? fmtOre(orePreviste) : "—"} nota={orePreviste == null ? "non impostate" : "manodopera"} colore="var(--color-black)" />
        <Contatore etichetta="Consumate" valore={fmtOre(oreConsumate)} colore={coloreBarra}
          nota={pct != null ? `${Math.round(pct * 100)}% ${orePreviste != null ? "del previsto" : "dello standard"}` : "ODP e rilavorazioni"} />
        <Contatore etichetta="Standard articolo" valore={oreStandard != null ? fmtOre(oreStandard) : "—"} nota={oreStandard == null ? "nessuno storico" : "media storica"} colore="var(--color-black)" />
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: "#ebe9e5" }} role="img"
        aria-label={`Consumate ${fmtOre(oreConsumate)}${orePreviste != null ? `, previste ${fmtOre(orePreviste)}` : ""}${oreStandard != null ? `, standard ${fmtOre(oreStandard)}` : ""}`}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(oreConsumate), background: coloreBarra, transition: "width .4s ease" }} />
        {orePreviste != null && <span className="absolute -top-1 -bottom-1 w-0.5" style={{ left: pos(orePreviste), background: "var(--color-black)" }} title={`Previste ${fmtOre(orePreviste)}`} />}
        {oreStandard != null && <span className="absolute -top-1 -bottom-1 w-0.5" style={{ left: pos(oreStandard), background: "#9c9894", borderLeft: "1px dashed #fff" }} title={`Standard ${fmtOre(oreStandard)}`} />}
      </div>
      <div className="flex gap-4 text-[12.1px]" style={{ color: "var(--color-grey-mid)" }}>
        {orePreviste != null && <span><span className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: "var(--color-black)" }} />previste</span>}
        {oreStandard != null && <span><span className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: "#9c9894" }} />standard</span>}
      </div>
      {admin && (admin.valoreVendita != null || (orePreviste != null && admin.tariffa > 0)) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13.2px] pt-1" style={{ color: "var(--color-grey-mid)" }}>
          {admin.valoreVendita != null && <>
            <span>Vendita <strong style={{ color: "var(--color-black)" }}>{fmtEuro(admin.valoreVendita)}</strong></span>
            <span>Costo <strong style={{ color: "var(--color-black)" }}>{fmtEuro(costoDaVendita(admin.valoreVendita))}</strong></span>
          </>}
          {orePreviste != null && admin.tariffa > 0 && (
            <span>Manodopera <strong style={{ color: "var(--color-black)" }}>{fmtEuro(euroDaOre(orePreviste, admin.tariffa))}</strong></span>
          )}
        </div>
      )}
    </section>
  );
}
