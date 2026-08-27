import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { getInventarioAperto, getRigheByInventario } from "@/lib/inventarioMagazzinoRepository";
import NuovoInventarioLegnoForm from "@/components/NuovoInventarioLegnoForm";

export const dynamic = "force-dynamic";

export default async function InventarioLegnoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_LEGNO_ROLES.includes(session.role)) redirect("/");

  const sessione = await getInventarioAperto("legno");

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Inventario Legname
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Conteggio a riconteggio delle scorte
          </p>
        </div>
        <Link href="/magazzino/legno" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
          ← Magazzino
        </Link>
      </div>

      {sessione ? (
        <InventarioAttivoCard inventarioId={sessione.id} apertoDa={sessione.apertoDa} />
      ) : (
        <NuovoInventarioLegnoForm />
      )}
    </div>
  );
}

async function InventarioAttivoCard({ inventarioId, apertoDa }: { inventarioId: string; apertoDa: string }) {
  const righe = await getRigheByInventario(inventarioId);
  const contate = righe.filter(r => r.giacenzaContata != null).length;

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#92400E" }}>Inventario in corso</p>
      <p className="text-sm" style={{ color: "var(--color-black)" }}>Tutto il catalogo — aperto da {apertoDa}</p>
      <p className="text-lg font-bold" style={{ color: "var(--color-black)" }}>{contate} / {righe.length} contati</p>
      <Link
        href={`/magazzino/legno/inventario/${inventarioId}`}
        className="block text-center w-full py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "#92400E" }}
      >
        Vai al conteggio
      </Link>
    </div>
  );
}
