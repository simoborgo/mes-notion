import { notFound, redirect } from "next/navigation";
import { getSession, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getInventarioById, getRigheByInventario, AMBITO_VERNICI_LABEL } from "@/lib/inventarioMagazzinoRepository";
import { getVernici } from "@/lib/verniciRepository";
import InventarioVerniciDettaglio from "@/components/InventarioVerniciDettaglio";
import AggiungiVerniceLiberoForm from "@/components/AggiungiVerniceLiberoForm";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InventarioVerniciDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const sessione = await getInventarioById(id);
  if (!sessione) notFound();

  const righe = await getRigheByInventario(id);
  const contate = righe.filter(r => r.giacenzaContata != null).length;
  const mostraAggiungi = sessione.ambito === "libero" && sessione.stato === "aperto";
  const vernici = mostraAggiungi ? await getVernici({ soloAttivi: true }) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Inventario Vernici — {AMBITO_VERNICI_LABEL[sessione.ambito]}{sessione.ambitoValore ? `: ${sessione.ambitoValore}` : ""}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Aperto da {sessione.apertoDa} il {fmt(sessione.apertoIl)}
          {sessione.stato === "chiuso" && sessione.chiusoIl && ` · Chiuso da ${sessione.chiusoDa} il ${fmt(sessione.chiusoIl)}`}
          {" · "}{contate} / {righe.length} contati
        </p>
      </div>
      {mostraAggiungi && <AggiungiVerniceLiberoForm inventarioId={id} vernici={vernici} />}
      <InventarioVerniciDettaglio inventarioId={id} stato={sessione.stato} righe={righe} puoChiudere={MAGAZZINO_VERNICI_ROLES.includes(session.role)} />
    </div>
  );
}
