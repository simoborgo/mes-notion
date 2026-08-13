import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, FERRAMENTA_ROLES, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { getCommesse } from "@/lib/commesseRepository";
import { getKitCommesse } from "@/lib/kitCommessaRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import FormNuovoKitCommessa from "@/components/FormNuovoKitCommessa";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function KitCommessaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!KIT_COMMESSA_CREA_ROLES.includes(session.role)) redirect("/");
  const canManage = FERRAMENTA_ROLES.includes(session.role);

  const [commesseList, apertiTutti, chiusi] = await Promise.all([
    getCommesse(),
    getKitCommesse("aperto"),
    getKitCommesse("chiuso"),
  ]);
  // Due fasi mutuamente esclusive (vedi KitCommessaDettaglio): in preparazione = l'Ufficio
  // Tecnico sta ancora scrivendo la lista, non c'è nulla da spuntare; pronti = confermati e
  // notificati, è qui che il magazziniere trova le "richieste" da evadere.
  const inPreparazione = apertiTutti.filter(k => !k.confermatoIl);
  const pronti = apertiTutti.filter(k => k.confermatoIl);

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={canManage} soloKitCommessa={!canManage} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Kit Commessa
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Liste di ferramenta legate a una Commessa — a mano, da Excel, o con un PDF di riferimento allegato
        </p>
      </div>

      <FormNuovoKitCommessa commesseList={commesseList} />

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Pronti per il magazziniere</h2>
        {pronti.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna richiesta confermata in attesa</p>
        ) : (
          <div className="space-y-2">
            {pronti.map(k => (
              <Link
                key={k.id}
                href={`/ferramenta/kit-commessa/${k.id}`}
                className="block rounded-xl border p-4 hover:bg-green-50"
                style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                      {k.commessaLabel || k.commessaId}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      Aperto da {k.apertoDa} — {fmt(k.apertoIl)}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>
                    Pronto
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>In preparazione</h2>
        {inPreparazione.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna lista in preparazione</p>
        ) : (
          <div className="space-y-2">
            {inPreparazione.map(k => (
              <Link
                key={k.id}
                href={`/ferramenta/kit-commessa/${k.id}`}
                className="block rounded-xl border p-4 hover:bg-orange-50"
                style={{ borderColor: "#FDE8D0", background: "#FFF7ED" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                      {k.commessaLabel || k.commessaId}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      Aperto da {k.apertoDa} — {fmt(k.apertoIl)}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    Bozza
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Storico</h2>
        {chiusi.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun Kit Commessa chiuso</p>
        ) : (
          <div className="space-y-2">
            {chiusi.slice(0, 30).map(k => (
              <Link
                key={k.id}
                href={`/ferramenta/kit-commessa/${k.id}`}
                className="block rounded-xl border p-3 hover:bg-gray-50"
                style={{ borderColor: "#e5e4e0" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
                      {k.commessaLabel || k.commessaId}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      {k.apertoDa} — chiuso {k.chiusoIl ? fmt(k.chiusoIl) : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
                    Chiuso
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
