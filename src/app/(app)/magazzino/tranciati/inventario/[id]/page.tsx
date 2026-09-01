import { notFound, redirect } from "next/navigation";
import { getSession, MAGAZZINO_TRANCIATI_ROLES } from "@/lib/auth";
import { getInventarioById, getRigheByInventario } from "@/lib/inventarioMagazzinoRepository";
import InventarioTranciatiDettaglio from "@/components/InventarioTranciatiDettaglio";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InventarioTranciatiDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const sessione = await getInventarioById(id);
  if (!sessione) notFound();

  const righe = await getRigheByInventario(id);
  const contate = righe.filter(r => r.giacenzaContata != null).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Inventario Tranciati — Tutto il catalogo
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Aperto da {sessione.apertoDa} il {fmt(sessione.apertoIl)}
          {sessione.stato === "chiuso" && sessione.chiusoIl && ` · Chiuso da ${sessione.chiusoDa} il ${fmt(sessione.chiusoIl)}`}
          {" · "}{contate} / {righe.length} contati
        </p>
      </div>
      <InventarioTranciatiDettaglio inventarioId={id} stato={sessione.stato} righe={righe} puoChiudere={MAGAZZINO_TRANCIATI_ROLES.includes(session.role)} />
    </div>
  );
}
