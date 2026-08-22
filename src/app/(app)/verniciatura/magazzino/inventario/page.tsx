import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, VERNICIATURA_ROLES, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { getInventarioAperto, getRigheByInventario, AMBITO_VERNICI_LABEL } from "@/lib/inventarioMagazzinoRepository";
import NuovoInventarioVerniciForm from "@/components/NuovoInventarioVerniciForm";
import VerniciaturaSubNav from "@/components/VerniciaturaSubNav";

export const dynamic = "force-dynamic";

export default async function InventarioVerniciPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!MAGAZZINO_VERNICI_ROLES.includes(session.role)) redirect("/");

  const sessione = await getInventarioAperto("vernici");

  return (
    <div className="space-y-4">
      <VerniciaturaSubNav canProduzione={VERNICIATURA_ROLES.includes(session.role)} canMagazzino={true} />
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Inventario Vernici
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
              Conteggio a riconteggio delle scorte
            </p>
          </div>
          <Link href="/verniciatura/magazzino/inventario/storico" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
            Storico →
          </Link>
        </div>

        {sessione ? (
          <InventarioAttivoCard inventarioId={sessione.id} ambitoLabel={`${AMBITO_VERNICI_LABEL[sessione.ambito]}${sessione.ambitoValore ? `: ${sessione.ambitoValore}` : ""}`} apertoDa={sessione.apertoDa} />
        ) : (
          <NuovoInventarioVerniciForm />
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
        href={`/verniciatura/magazzino/inventario/${inventarioId}`}
        className="block text-center w-full py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "#92400E" }}
      >
        Vai al conteggio
      </Link>
    </div>
  );
}
