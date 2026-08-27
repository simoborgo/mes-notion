import { notFound, redirect } from "next/navigation";
import { getSession, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { getInventarioById, getRigheByInventario } from "@/lib/inventarioMagazzinoRepository";
import InventarioLegnoDettaglio from "@/components/InventarioLegnoDettaglio";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InventarioLegnoDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_LEGNO_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const sessione = await getInventarioById(id);
  if (!sessione) notFound();

  const righe = await getRigheByInventario(id);
  const contate = righe.filter(r => r.giacenzaContata != null).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Inventario Legname — Tutto il catalogo
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Aperto da {sessione.apertoDa} il {fmt(sessione.apertoIl)}
          {sessione.stato === "chiuso" && sessione.chiusoIl && ` · Chiuso da ${sessione.chiusoDa} il ${fmt(sessione.chiusoIl)}`}
          {" · "}{contate} / {righe.length} contati
        </p>
      </div>
      <InventarioLegnoDettaglio inventarioId={id} stato={sessione.stato} righe={righe} puoChiudere={MAGAZZINO_LEGNO_ROLES.includes(session.role)} />
    </div>
  );
}
