import { redirect } from "next/navigation";

// Spostato dentro /previsionale come tab (2026-08-08) — redirect per non rompere link/bookmark
// esistenti. Verso /previsionale semplice, non ?tab=parametri: su un caricamento a freddo
// (bookmark/link diretto, non navigazione client-side) la query string del redirect non atterra
// in modo affidabile sulla tab giusta — atterra sulla tab di default, un click in più per
// cambiare tab, accettabile per un percorso ormai solo di fallback (nessun link in app ci punta più).
export default function ParametriRepartoRedirect() {
  redirect("/previsionale");
}
