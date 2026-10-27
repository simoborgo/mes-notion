"use client";

import { useEffect, useState } from "react";
import type { Scheda } from "@/lib/types";

// Foto, PDF e altri allegati della scheda in sola lettura. Le foto aprono una galleria a schermo
// intero; i file sono link che si aprono nel browser. Le sezioni vuote non vengono mostrate.

const MAX_MINIATURE = 8;

const TIPI: Record<string, { sigla: string; colore: string }> = {
  pdf: { sigla: "PDF", colore: "#DC2626" },
  xls: { sigla: "XLS", colore: "#16803c" }, xlsx: { sigla: "XLS", colore: "#16803c" }, csv: { sigla: "CSV", colore: "#16803c" },
  doc: { sigla: "DOC", colore: "#2563eb" }, docx: { sigla: "DOC", colore: "#2563eb" },
  dwg: { sigla: "DWG", colore: "#2563eb" }, dxf: { sigla: "DXF", colore: "#2563eb" },
  zip: { sigla: "ZIP", colore: "#78716c" },
};

function iconaFile(nome: string) {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  return TIPI[ext] ?? { sigla: ext.slice(0, 4).toUpperCase() || "FILE", colore: "#78716c" };
}

function Titolo({ children, n }: { children: React.ReactNode; n: number }) {
  return (
    <h3 className="text-[12.1px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9c9894" }}>
      {children} <span className="ml-1 px-1.5 rounded-full text-[11.5px] font-semibold normal-case tracking-normal" style={{ background: "#ebe9e5", color: "var(--color-grey-mid)" }}>{n}</span>
    </h3>
  );
}

function ListaFile({ file }: { file: { name: string; url: string }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {file.map((f, i) => {
        const t = iconaFile(f.name);
        return (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[15.4px] bg-white hover:bg-[#f8f7f5] transition-colors"
            style={{ borderColor: "#e5e4e0" }}>
            <span className="w-[30px] h-[30px] rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: t.colore }}>{t.sigla}</span>
            <span className="truncate min-w-0">{f.name || `${t.sigla} ${i + 1}`}</span>
          </a>
        );
      })}
    </div>
  );
}

function Lightbox({ foto, iniziale, onClose }: { foto: Scheda["foto"]; iniziale: number; onClose: () => void }) {
  const [i, setI] = useState(iniziale);
  const n = foto.length;

  // In fase di cattura sulla window: Esc e frecce non arrivano al modale/pagina sottostante
  // (che con Esc si chiuderebbe o tornerebbe all'elenco).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((c) => (c + 1) % n);
      else if (e.key === "ArrowLeft") setI((c) => (c - 1 + n) % n);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [n, onClose]);

  const f = foto[i];
  const btn = "px-3 py-1.5 rounded-lg text-[13.2px] text-white hover:bg-white/25 transition-colors";
  return (
    <div className="fixed inset-0 z-[100] flex flex-col text-white" style={{ background: "rgba(10,10,10,0.92)" }} role="dialog" aria-label="Galleria foto">
      <div className="flex items-center justify-between px-5 py-3 text-[15.4px]">
        <span>{f.name ? `${f.name} · ` : ""}{i + 1} / {n}</span>
        <span className="flex gap-2">
          <a href={f.url} target="_blank" rel="noopener noreferrer" className={btn} style={{ background: "rgba(255,255,255,0.12)" }}>Apri originale ↗</a>
          <a href={f.url} download={f.name || true} className={btn} style={{ background: "rgba(255,255,255,0.12)" }}>Scarica</a>
          <button type="button" onClick={onClose} className={btn} style={{ background: "rgba(255,255,255,0.12)" }}>Chiudi (Esc)</button>
        </span>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 px-2" onClick={onClose}>
        {n > 1 && <button type="button" aria-label="Foto precedente" className="text-4xl px-4 py-6 opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setI((i - 1 + n) % n); }}>‹</button>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.url} alt={f.name} className="max-h-full max-w-[min(85vw,1200px)] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        {n > 1 && <button type="button" aria-label="Foto successiva" className="text-4xl px-4 py-6 opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setI((i + 1) % n); }}>›</button>}
      </div>
      {n > 1 && (
        <div className="flex gap-1.5 justify-center p-3 overflow-x-auto">
          {foto.map((p, k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={k} src={p.url} alt="" loading="lazy" onClick={() => setI(k)}
              className="w-[54px] h-[54px] object-cover rounded-md cursor-pointer shrink-0"
              style={{ opacity: k === i ? 1 : 0.5, outline: k === i ? "2px solid var(--color-primary)" : undefined }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GalleriaAllegatiScheda({ scheda: s }: { scheda: Pick<Scheda, "foto" | "pdfAllegato" | "allegati"> }) {
  const [aperta, setAperta] = useState<number | null>(null);
  const foto = s.foto;
  const eccedenti = foto.length > MAX_MINIATURE ? foto.length - MAX_MINIATURE + 1 : 0;
  const visibili = eccedenti ? foto.slice(0, MAX_MINIATURE) : foto;

  if (!foto.length && !s.pdfAllegato.length && !s.allegati.length) return null;

  return (
    <div className="space-y-5 min-w-0">
      {foto.length > 0 && (
        <section>
          <Titolo n={foto.length}>Foto</Titolo>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
            {visibili.map((f, i) => (
              <button key={f.id ?? i} type="button" onClick={() => setAperta(i)} title={f.name}
                className="relative aspect-square rounded-lg border overflow-hidden cursor-zoom-in hover:outline hover:outline-2 hover:outline-[var(--color-primary)]"
                style={{ borderColor: "#e5e4e0" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} loading="lazy" className="w-full h-full object-cover" />
                {eccedenti > 0 && i === visibili.length - 1 && (
                  <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-white" style={{ background: "rgba(0,0,0,0.55)" }}>+{eccedenti}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {(s.pdfAllegato.length > 0 || s.allegati.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {s.pdfAllegato.length > 0 && <section className="min-w-0"><Titolo n={s.pdfAllegato.length}>PDF</Titolo><ListaFile file={s.pdfAllegato.map((p) => ({ ...p, name: p.name || "documento.pdf" }))} /></section>}
          {s.allegati.length > 0 && <section className="min-w-0"><Titolo n={s.allegati.length}>Altri allegati</Titolo><ListaFile file={s.allegati} /></section>}
        </div>
      )}
      {aperta !== null && <Lightbox foto={foto} iniziale={aperta} onClose={() => setAperta(null)} />}
    </div>
  );
}
