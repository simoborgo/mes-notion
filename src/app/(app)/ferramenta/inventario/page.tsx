import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getInventarioAperto, getRigheByInventario } from "@/lib/inventarioFerramentaRepository";
import NuovoInventarioForm from "@/components/NuovoInventarioForm";
import FerramentaSubNav from "@/components/FerramentaSubNav";

export const dynamic = "force-dynamic";

const AMBITO_LABEL: Record<string, string> = {
  tutto: "Tutto il catalogo",
  kanban: "Solo Kanban",
  ubicazione: "Ubicazione",
  sotto_scorta: "Sotto scorta",
};

export default async function InventarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const sessione = await getInventarioAperto();

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Inventario Ferramenta
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
              Conteggio a riconteggio delle scorte
            </p>
          </div>
          <Link href="/ferramenta/inventario/storico" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
            Storico →
          </Link>
        </div>

        {sessione ? (
          <InventarioAttivoCard inventarioId={sessione.id} ambitoLabel={`${AMBITO_LABEL[sessione.ambito]}${sessione.ambitoValore ? `: ${sessione.ambitoValore}` : ""}`} apertoDa={sessione.apertoDa} />
        ) : (
          <NuovoInventarioForm />
        )}
      </div>
    </div>
  );
}

async function InventarioAttivoCard({ inventarioId, ambitoLabel, apertoDa }: { inventarioId: string; ambitoLabel: string; apertoDa: string }) {
  const righe = await getRigheByInventario(inventarioId);
  const contate = righe.filter(r => r.giacenzaContata != null).length;

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#92400E" }}>Inventario in corso</p>
      <p className="text-sm" style={{ color: "var(--color-black)" }}>{ambitoLabel} — aperto da {apertoDa}</p>
      <p className="text-lg font-bold" style={{ color: "var(--color-black)" }}>{contate} / {righe.length} contati</p>
      <Link
        href={`/ferramenta/inventario/${inventarioId}`}
        className="block text-center w-full py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "#92400E" }}
      >
        Vai al conteggio
      </Link>
    </div>
  );
}
