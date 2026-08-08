import { redirect } from "next/navigation";

// Spostato dentro /previsionale come tab (2026-08-08) — redirect per non rompere link/bookmark
// esistenti. Verso /previsionale semplice, non ?tab=offerte: su un caricamento a freddo la query
// string del redirect non atterra in modo affidabile sulla tab giusta (vedi stesso commento in
// admin/parametri-reparto/page.tsx). /offerte/[id] (dettaglio) resta una pagina a sé, non spostata.
export default function OffertePageRedirect() {
  redirect("/previsionale");
}
