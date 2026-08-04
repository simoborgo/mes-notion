import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getOdpAttivi } from "@/lib/notion";
import { getDistinte } from "@/lib/distinteScaricoRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import FormNuovaDistintaScarico from "@/components/FormNuovaDistintaScarico";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function DistinteScaricoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const [odpList, aperte, chiuse] = await Promise.all([
    getOdpAttivi(),
    getDistinte("aperta"),
    getDistinte("chiusa"),
  ]);

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Distinte di Scarico
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Raccogli più articoli scansionando gli scaffali, poi scarica tutto insieme
        </p>
      </div>

      <FormNuovaDistintaScarico odpList={odpList} />

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Aperte</h2>
        {aperte.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna distinta aperta</p>
        ) : (
          <div className="space-y-2">
            {aperte.map(d => (
              <Link
                key={d.id}
                href={`/ferramenta/distinte-scarico/${d.id}`}
                className="block rounded-xl border p-4 hover:bg-orange-50"
                style={{ borderColor: "#FDE8D0", background: "#FFF7ED" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                      {d.odpLabel || "Distinta libera"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      Aperta da {d.apertaDa} — {fmt(d.apertaIl)}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    Aperta
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Storico</h2>
        {chiuse.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna distinta chiusa</p>
        ) : (
          <div className="space-y-2">
            {chiuse.slice(0, 30).map(d => (
              <Link
                key={d.id}
                href={`/ferramenta/distinte-scarico/${d.id}`}
                className="block rounded-xl border p-3 hover:bg-gray-50"
                style={{ borderColor: "#e5e4e0" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
                      {d.odpLabel || "Distinta libera"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      {d.apertaDa} — chiusa {d.chiusaIl ? fmt(d.chiusaIl) : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
                    Chiusa
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
