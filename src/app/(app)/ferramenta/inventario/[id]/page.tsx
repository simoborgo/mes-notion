import { notFound, redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getInventarioById, getRigheByInventario } from "@/lib/inventarioFerramentaRepository";
import InventarioDettaglio from "@/components/InventarioDettaglio";

export const dynamic = "force-dynamic";

const AMBITO_LABEL: Record<string, string> = {
  tutto: "Tutto il catalogo",
  kanban: "Solo Kanban",
  ubicazione: "Ubicazione",
  sotto_scorta: "Sotto scorta",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InventarioDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const { id } = await params;
  const sessione = await getInventarioById(id);
  if (!sessione) notFound();

  const righe = await getRigheByInventario(id);
  const contate = righe.filter(r => r.giacenzaContata != null).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Inventario — {AMBITO_LABEL[sessione.ambito]}{sessione.ambitoValore ? `: ${sessione.ambitoValore}` : ""}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Aperto da {sessione.apertoDa} il {fmt(sessione.apertoIl)}
          {sessione.stato === "chiuso" && sessione.chiusoIl && ` · Chiuso da ${sessione.chiusoDa} il ${fmt(sessione.chiusoIl)}`}
          {" · "}{contate} / {righe.length} contati
        </p>
      </div>
      <InventarioDettaglio inventarioId={id} stato={sessione.stato} righe={righe} puoChiudere={FERRAMENTA_ROLES.includes(session.role)} />
    </div>
  );
}
