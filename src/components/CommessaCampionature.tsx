import Link from "next/link";
import type { SchedaVerniciatura, StatoSchedaVerniciatura } from "@/lib/types";
import BadgeStato from "./BadgeStato";

const STATO_LABEL: Record<StatoSchedaVerniciatura, string> = { bozza: "Bozza", in_revisione: "In revisione", approvato: "Approvato", rifiutato: "Rifiutato" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

// Sola lettura: le Schede di Verniciatura vivono in Verniciatura, qui si leggono dal DB così stato
// e foto sono sempre aggiornati (nessuna copia). La creazione/modifica resta in /verniciatura/schede.
export default function CommessaCampionature({ schede, canVerniciatura }: { schede: SchedaVerniciatura[]; canVerniciatura: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Schede di Verniciatura collegate a questa commessa.</p>
        {canVerniciatura && (
          <Link href="/verniciatura/schede" className="text-sm font-semibold underline" style={{ color: "var(--color-primary)" }}>
            Apri Verniciatura →
          </Link>
        )}
      </div>
      {schede.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Nessuna scheda di verniciatura collegata. Si collega scegliendo questa commessa nella scheda, da Verniciatura.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {schede.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-4">
              <span className="text-xs font-semibold w-8 shrink-0 pt-0.5" style={{ color: "var(--color-grey-mid)" }}>v{s.versione}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.nome || "Senza nome"}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                  {[
                    s.codicePubblico && `Codice ${s.codicePubblico}`,
                    s.essenza && `Essenza ${s.essenza}`,
                    s.ignifuga != null && `Ignifuga ${s.ignifuga ? "sì" : "no"}`,
                    `Prova del ${fmt(s.dataProva)}`,
                  ].filter(Boolean).join(" · ")}
                </p>
                {(s.foto?.length ?? 0) > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {s.foto!.slice(0, 4).map((f) => (
                      <a key={f.id} href={`/api/drive-file/${f.driveFileId}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/drive-file/${f.driveFileId}`} alt={f.nomeFile ?? "foto campione"} className="rounded border object-cover" style={{ width: 52, height: 40, borderColor: "#E4E0DA" }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <BadgeStato stato={STATO_LABEL[s.stato]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
