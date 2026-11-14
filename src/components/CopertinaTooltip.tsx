"use client";

import { useEffect, useRef, useState } from "react";

export interface TooltipState {
  copertinaUrl: string;
  x: number;
  y: number;
}

// copertinaUrl arriva già risolta da s.copertina (Drive o legacy Notion, calcolato dal
// repository) — niente più fetch verso /api/files/[pageId] qui: per una Scheda con copertina
// caricata dopo la migrazione (Drive), quella query interrogava sempre la pagina Notion
// congelata e falliva sempre (stesso bug del link PDF in tabella, corretto nella stessa sessione).
export default function CopertinaTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!tooltip || !ref.current) return;
    const { x, y } = tooltip;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const W = 380;
    const H = 320;
    const left = x + 20 + W > vw ? x - W - 12 : x + 20;
    const top = y + 12 + H > vh ? vh - H - 12 : y + 12;
    setPos({ top, left });
  }, [tooltip]);

  if (!tooltip) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: 380, background: "white" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tooltip.copertinaUrl} alt="Copertina" className="block w-full" style={{ maxHeight: 360, objectFit: "contain" }} />
    </div>
  );
}

