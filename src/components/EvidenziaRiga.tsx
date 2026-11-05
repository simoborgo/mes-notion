"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Se l'indirizzo contiene ?r=<id> (arrivo dalla ricerca della commessa), porta in vista la riga
// con id "riga-<id>" e la fa lampeggiare. Non fa nulla se la riga non c'è (es. filtro attivo).
export default function EvidenziaRiga() {
  const r = useSearchParams().get("r");
  useEffect(() => {
    if (!r) return;
    const el = document.getElementById(`riga-${r}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.animate([{ backgroundColor: "#FBD9A8" }, { backgroundColor: "#FDEBD6", offset: 0.6 }, { backgroundColor: "rgba(253,235,214,0)" }], { duration: 3000 });
  }, [r]);
  return null;
}
