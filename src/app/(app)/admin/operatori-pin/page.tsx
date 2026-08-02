import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOperatori } from "@/lib/notion";
import { getMatricoleConPin } from "@/lib/operatoriPinRepository";
import TabellaOperatoriPin from "@/components/TabellaOperatoriPin";

export const dynamic = "force-dynamic";

export default async function AdminOperatoriPinPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  const [operatori, conPin] = await Promise.all([getOperatori(), getMatricoleConPin()]);
  const lista = operatori.map(o => ({ ...o, hasPin: conPin.has(o.matricola) }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-black)" }}>
          PIN operatori
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Il PIN identifica il singolo operatore sul tablet di reparto (sezione <code>/operatore</code>), separato dal login condiviso dell&apos;app.
        </p>
      </div>
      <TabellaOperatoriPin operatoriIniziali={lista} />
    </div>
  );
}
