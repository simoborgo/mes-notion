// Badge colorati specifici del modulo Verniciatura — stessa formula del resto del MES
// (bg pastello chiaro + text scuro saturo, radius-badge), ma con una tavolozza più ampia:
// la sezione è volutamente "un po' più colorata" del resto, su richiesta esplicita.
import type { RuoloInFase } from "@/lib/types";

const CHIP_CLS = "inline-block px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const RUOLO_IN_FASE_STYLE: Record<RuoloInFase, { bg: string; text: string; label: string }> = {
  vernice: { bg: "#FFE8D1", text: "#C06A10", label: "Vernice" },
  catalizzatore: { bg: "#EDE9FE", text: "#5B21B6", label: "Catalizzatore" },
  diluente: { bg: "#DBEAFE", text: "#1E40AF", label: "Diluente" },
  indurente: { bg: "#CCFBF1", text: "#0F766E", label: "Indurente" },
  additivo: { bg: "#FCE7F3", text: "#9D174D", label: "Additivo" },
  altro: { bg: "#F3F4F6", text: "#374151", label: "Altro" },
};

export function RuoloInFaseBadge({ ruolo }: { ruolo: RuoloInFase }) {
  const { bg, text, label } = RUOLO_IN_FASE_STYLE[ruolo];
  return (
    <span className={CHIP_CLS} style={{ background: bg, color: text, borderRadius: "var(--radius-badge)" }}>
      {label}
    </span>
  );
}
