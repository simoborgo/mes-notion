import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, FERRAMENTA_ROLES } from "@/lib/auth";
import { getArticoliFerramenta } from "@/lib/articoliFerramentaRepository";
import { getScarichi } from "@/lib/scaricoRepository";
import FerramentaSubNav from "@/components/FerramentaSubNav";
import FormNuovoScarico from "@/components/FormNuovoScarico";
import ScaricoRapidoForm from "@/components/ScaricoRapidoForm";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function ScarichiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!FERRAMENTA_ROLES.includes(session.role)) redirect("/");

  const [articoliTutti, aperti, chiusi] = await Promise.all([
    getArticoliFerramenta(),
    getScarichi("aperta"),
    getScarichi("chiusa"),
  ]);
  const articoli = articoliTutti.filter(a => a.attivo);

  return (
    <div className="space-y-4">
      <FerramentaSubNav canManage={FERRAMENTA_ROLES.includes(session.role)} />
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Scarico
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Scarico rapido di un singolo articolo, oppure raccogli più articoli scansionando gli scaffali e scarica tutto insieme
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Scarico rapido — un articolo</h2>
          <ScaricoRapidoForm articoli={articoli} />
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Raccolta multipla via QR</h2>
          <FormNuovoScarico />
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>Aperti</h2>
          {aperti.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuno scarico aperto</p>
          ) : (
            <div className="space-y-2">
              {aperti.map(s => (
                <Link
                  key={s.id}
                  href={`/ferramenta/scarichi/${s.id}`}
                  className="block rounded-xl border p-4 hover:bg-red-50"
                  style={{ borderColor: "#FECACA", background: "#FEF2F2" }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                        {s.odpLabel || "Scarico libero"}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                        Aperto da {s.apertaDa} — {fmt(s.apertaIl)}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                      Aperto
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
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuno scarico chiuso</p>
          ) : (
            <div className="space-y-2">
              {chiusi.slice(0, 30).map(s => (
                <Link
                  key={s.id}
                  href={`/ferramenta/scarichi/${s.id}`}
                  className="block rounded-xl border p-3 hover:bg-gray-50"
                  style={{ borderColor: "#e5e4e0" }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
                        {s.odpLabel || "Scarico libero"}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                        {s.apertaDa} — chiuso {s.chiusaIl ? fmt(s.chiusaIl) : ""}
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
    </div>
  );
}
