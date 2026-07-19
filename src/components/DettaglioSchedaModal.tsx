"use client";

import { useEffect, useRef } from "react";
import type { Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";

interface Props {
  scheda: Scheda;
  onClose: () => void;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md px-3 py-2" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
      <div className="text-xs font-medium mb-0.5" style={{ color: "var(--color-grey-mid)" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: "var(--color-black)" }}>{value || "—"}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function DettaglioSchedaModal({ scheda: s, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const today = new Date().toISOString().slice(0, 10);
  const inRitardoProd = !["Completato", "Annullato"].includes(s.statoProduzione) && !!s.dataProduzionePrevista && s.dataProduzionePrevista < today;
  const inRitardoRientro = !["Completato", "Annullato"].includes(s.statoProduzione) && s.produzioneEsterna && !!s.dataRientroPrevista && s.dataRientroPrevista < today;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-end"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative h-full overflow-y-auto shadow-2xl"
        style={{ width: "min(640px, 100vw)", background: "white" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 border-b" style={{ background: "white", borderColor: "#e5e4e0" }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xl" style={{ color: "var(--color-black)" }}>
                {s.odp || "—"}
              </span>
              {s.numeroScheda && (
                <span className="text-sm px-2 py-0.5 rounded" style={{ background: "#f3f2ef", color: "var(--color-grey-mid)" }}>
                  N. {s.numeroScheda}
                </span>
              )}
              <BadgeStato stato={s.statoProduzione} />
            </div>
            <div className="text-sm mt-1 truncate" style={{ color: "var(--color-grey-mid)" }}>
              {s.clienteInfo || "—"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={s.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors hover:bg-gray-50"
              style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              Notion
            </a>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-gray-100"
              style={{ color: "var(--color-grey-mid)" }}
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">

          {/* Avvisi ritardo */}
          {(inRitardoProd || inRitardoRientro) && (
            <div className="rounded-md px-4 py-3 space-y-1" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
              {inRitardoProd && (
                <div className="text-sm font-medium" style={{ color: "#991B1B" }}>
                  ⚠ Produzione in ritardo — prevista il {fmt(s.dataProduzionePrevista)}
                </div>
              )}
              {inRitardoRientro && (
                <div className="text-sm font-medium" style={{ color: "#991B1B" }}>
                  ⚠ Rientro materiale in ritardo — previsto il {fmt(s.dataRientroPrevista)}
                </div>
              )}
            </div>
          )}

          {/* Copertina */}
          {s.copertina && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.copertina}
              alt="Copertina"
              className="w-full rounded-lg object-contain border"
              style={{ maxHeight: 280, borderColor: "#e5e4e0" }}
            />
          )}

          {/* Dati principali */}
          <Section title="Dati scheda">
            <div className="grid grid-cols-2 gap-2">
              <InfoItem label="Codice Articolo" value={s.codiceArticolo} />
              <InfoItem label="Tipologia" value={s.tipologia} />
              {s.quantita != null && <InfoItem label="Quantità" value={String(s.quantita)} />}
              {s.posizione && <InfoItem label="Posizione" value={s.posizione} />}
              {s.areaLabel && <InfoItem label="Area" value={s.areaLabel} />}
              {s.commessaNr && <InfoItem label="Commessa" value={s.commessaNr} />}
            </div>
            {s.descrizioneFasi && (
              <div className="rounded-md px-3 py-2.5" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
                <div className="text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>Descrizione / Fasi</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-black)" }}>{s.descrizioneFasi}</div>
              </div>
            )}
          </Section>

          {/* Stato produzione */}
          <Section title="Stato produzione">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md px-3 py-2" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
                <div className="text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>Stato</div>
                <BadgeStato stato={s.statoProduzione} />
              </div>
              {s.faseCorrente && (
                <div className="rounded-md px-3 py-2" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
                  <div className="text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>Fase corrente</div>
                  <BadgeStato stato={s.faseCorrente} />
                </div>
              )}
            </div>
          </Section>

          {/* Date */}
          <Section title="Date">
            <div className="grid grid-cols-2 gap-2">
              <InfoItem label="Scheda ricevuta" value={fmt(s.dataSchedaRicevuta)} />
              <InfoItem label="Produzione prevista" value={
                <span style={inRitardoProd ? { color: "#991B1B", fontWeight: 700 } : undefined}>
                  {fmt(s.dataProduzionePrevista)}
                </span>
              } />
            </div>
          </Section>

          {/* Produzione esterna */}
          {s.produzioneEsterna && (
            <Section title="Produzione esterna">
              <div className="grid grid-cols-2 gap-2">
                {s.fornitore && <InfoItem label="Fornitore" value={s.fornitore} />}
                {s.ordineFornitore && <InfoItem label="Ordine fornitore" value={s.ordineFornitore} />}
                {s.statoProdEsterna && (
                  <div className="rounded-md px-3 py-2" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
                    <div className="text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>Stato est.</div>
                    <BadgeStato stato={s.statoProdEsterna} />
                  </div>
                )}
                <InfoItem label="Uscita materiale" value={fmt(s.dataUscitaMateriale)} />
                <InfoItem label="Rientro previsto" value={
                  <span style={inRitardoRientro ? { color: "#991B1B", fontWeight: 700 } : undefined}>
                    {fmt(s.dataRientroPrevista)}
                  </span>
                } />
                <InfoItem label="Rientro effettivo" value={fmt(s.dataRientroEffettiva)} />
              </div>
            </Section>
          )}

          {/* PDF */}
          {s.pdfAllegato.length > 0 && (
            <Section title="PDF allegati">
              <div className="flex flex-col gap-2">
                {s.pdfAllegato.map((pdf, i) => (
                  <a
                    key={i}
                    href={pdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors hover:bg-red-50"
                    style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                    </svg>
                    {pdf.name || (s.pdfAllegato.length > 1 ? `PDF ${i + 1}` : "Apri PDF")}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Note */}
          {s.note && (
            <Section title="Note">
              <div className="rounded-md px-3 py-2.5" style={{ background: "#faf9f7", border: "1px solid #e5e4e0" }}>
                <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-black)" }}>{s.note}</p>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}
