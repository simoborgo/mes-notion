"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { caricaDocumento, type DocumentoRender } from "@/lib/documentoRender";
import { disegnaOverlay, type Point, type Stamp, type ZonaRender, type ModoPianta } from "@/lib/pianteOverlay";

export type { Point, Stamp, ZonaRender, ModoPianta } from "@/lib/pianteOverlay";

// Motore di visualizzazione e annotazione PDF/immagine, portato da SpedizioneVerifica (stesso
// rendering a due canvas, stessi gesti, stesso formato dati per pagina in coordinate 0–1).
// Contiene solo la parte comune: lock, foto e finalizzazione restano della spedizione.

export interface Annotazioni {
  strokes: Record<number, Point[][]>;
  stamps: Record<number, Stamp[]>;
}

const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DIST = 0.03;
const TAP_MOVE_THRESHOLD = 0.01;
const LONG_PRESS_MS = 800;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const MAX_PIXEL = 16_000_000;
const ATTESA_ZOOM_MS = 250;

const btnStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 4, background: "#F5F2EE", color: "#1A1918",
  border: "1px solid #E5E4E0", fontSize: 12, cursor: "pointer",
};

interface Props {
  url: string;
  mimeType: string;
  iniziali?: Partial<Annotazioni>;
  // Chiamata a ogni modifica di tratti/bolli o cambio pagina: il salvataggio (debounce) è del chiamante.
  onChange?: (a: Annotazioni & { currentPage: number }) => void;
  readOnly?: boolean;
  height?: string;
  modo?: ModoPianta;
  zone?: ZonaRender[];
  onZonaCreata?: (r: { pagina: number; x: number; y: number; w: number; h: number }) => void;
  onZonaClick?: (id: string | null) => void;
  barraExtra?: React.ReactNode;
  // Apre la pianta ingrandita con questo punto (coordinate 0–1) al centro.
  centraSu?: { pagina: number; x: number; y: number };
}

export default function PdfAnnotabile({ url, mimeType, iniziali, onChange, readOnly = false, height = "calc(100vh - 220px)", modo = "segni", zone, onZonaCreata, onZonaClick, barraExtra, centraSu }: Props) {
  const [strokes, setStrokes] = useState<Record<number, Point[][]>>(iniziali?.strokes ?? {});
  const [stamps, setStamps] = useState<Record<number, Stamp[]>>(iniziali?.stamps ?? {});
  const [currentPage, setCurrentPage] = useState(centraSu?.pagina ?? 1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(centraSu ? 1.6 : 1);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(0);
  const [pronta, setPronta] = useState(false); // primo rendering completato: da qui in poi si può interagire

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<DocumentoRender | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const baseDimRef = useRef<{ w: number; h: number } | null>(null);
  const ultimaPaginaRef = useRef(0);
  const centraSuRef = useRef(centraSu);
  const lastTapRef = useRef<{ time: number; x: number; y: number; page: number } | null>(null);
  const currentStrokeRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<Point | null>(null);
  const primoGiroRef = useRef(true);

  // specchi mutabili dello stato per gli handler degli eventi
  const strokesRef = useRef(strokes);
  const stampsRef = useRef(stamps);
  const currentPageRef = useRef(currentPage);
  const zoomRef = useRef(zoomFactor);
  const onChangeRef = useRef(onChange);
  const modoRef = useRef<ModoPianta>(readOnly ? "vista" : modo);
  const zoneRef = useRef(zone);
  const onZonaCreataRef = useRef(onZonaCreata);
  const onZonaClickRef = useRef(onZonaClick);
  const rettangoloLiveRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { stampsRef.current = stamps; }, [stamps]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { zoomRef.current = zoomFactor; }, [zoomFactor]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  // in sola lettura i segni non si disegnano mai: restano solo i clic sulle zone
  useEffect(() => { modoRef.current = readOnly ? "vista" : modo; }, [modo, readOnly]);
  useEffect(() => { zoneRef.current = zone; }, [zone]);
  useEffect(() => { onZonaCreataRef.current = onZonaCreata; onZonaClickRef.current = onZonaClick; }, [onZonaCreata, onZonaClick]);

  useEffect(() => {
    if (primoGiroRef.current) { primoGiroRef.current = false; return; }
    onChangeRef.current?.({ strokes, stamps, currentPage });
  }, [strokes, stamps, currentPage]);

  // ── Ridisegno annotazioni ─────────────────────────────────────────────────
  const redrawAnnotations = useCallback((liveStroke?: Point[]) => {
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = drawCanvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    disegnaOverlay(ctx, drawCanvas.width / dpr, drawCanvas.height / dpr, {
      pagina: currentPageRef.current, strokes: strokesRef.current, stamps: stampsRef.current,
      zone: zoneRef.current, liveStroke, liveRect: rettangoloLiveRef.current,
    });
    ctx.restore();
  }, []);

  // ── Rendering pagina ──────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    const page = await pdf.getPage(pageNum);
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!pdfCanvas || !drawCanvas || !container) return;

    const zoom = zoomRef.current;
    const viewport0 = page.getViewport({ scale: 1 });
    const containerW = container.clientWidth || 360;
    const base = Math.min(3, containerW / viewport0.width);
    baseDimRef.current = { w: viewport0.width * base, h: viewport0.height * base };
    const cssW = baseDimRef.current.w * zoom;
    const cssH = baseDimRef.current.h * zoom;
    const dpr = window.devicePixelRatio || 1;
    // tetto ai pixel del canvas: a zoom alto una pianta grande supera i 16M di pixel e rallenta tutto
    const k = Math.min(1, Math.sqrt(MAX_PIXEL / (cssW * dpr * cssH * dpr)));
    const vp = page.getViewport({ scale: base * zoom * dpr * k });

    // si disegna fuori schermo e si scambia a rendering finito: il canvas visibile non resta mai bianco
    const off = document.createElement("canvas");
    off.width = Math.round(vp.width); off.height = Math.round(vp.height);
    renderTaskRef.current?.cancel?.(); // un solo rendering alla volta (zoom ripetuti)
    const task = page.render({ canvasContext: off.getContext("2d")!, viewport: vp });
    renderTaskRef.current = task;
    try { await task.promise; } catch { return; /* annullato da un rendering più recente */ }
    if (zoom !== zoomRef.current || pageNum !== currentPageRef.current) return;

    pdfCanvas.width = off.width; pdfCanvas.height = off.height;
    pdfCanvas.getContext("2d")!.drawImage(off, 0, 0);
    drawCanvas.width = Math.round(cssW * dpr); drawCanvas.height = Math.round(cssH * dpr);
    for (const c of [pdfCanvas, drawCanvas]) {
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    ultimaPaginaRef.current = pageNum;
    redrawAnnotations();
    setPronta(true);
    const c = centraSuRef.current;
    if (c && c.pagina === pageNum) {
      centraSuRef.current = undefined; // una sola volta, al primo rendering
      const cr = container.getBoundingClientRect(), pr = pdfCanvas.getBoundingClientRect();
      container.scrollTo({
        left: pr.left - cr.left + container.scrollLeft + c.x * cssW - container.clientWidth / 2,
        top: pr.top - cr.top + container.scrollTop + c.y * cssH - container.clientHeight / 2,
      });
    }
  }, [redrawAnnotations]);

  // ── Gesti ─────────────────────────────────────────────────────────────────
  const attachPointerHandlers = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    function norm(e: PointerEvent): Point {
      const rect = canvas!.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    }
    function cancelLongPress() {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    }
    // zona più piccola che contiene il punto (le zone dentro altre zone restano cliccabili)
    function zonaSu(pt: Point): string | null {
      let best: ZonaRender | null = null;
      for (const z of zoneRef.current ?? []) {
        if (z.pagina !== currentPageRef.current) continue;
        if (pt.x < z.x || pt.x > z.x + z.w || pt.y < z.y || pt.y > z.y + z.h) continue;
        if (!best || z.w * z.h < best.w * best.h) best = z;
      }
      return best?.id ?? null;
    }
    function rettangolo(a: Point, b: Point) {
      // il puntatore può uscire dal bordo mentre si trascina: le coordinate restano dentro 0–1
      const c = (n: number) => Math.min(1, Math.max(0, n));
      const x0 = c(Math.min(a.x, b.x)), y0 = c(Math.min(a.y, b.y));
      return { x: x0, y: y0, w: c(Math.max(a.x, b.x)) - x0, h: c(Math.max(a.y, b.y)) - y0 };
    }

    function onDown(e: PointerEvent) {
      e.preventDefault();
      canvas!.setPointerCapture(e.pointerId);
      const pt = norm(e);
      pointerStartRef.current = pt;
      if (modoRef.current !== "segni") return;
      isDrawingRef.current = false;
      currentStrokeRef.current = [pt];
      longPressTimerRef.current = setTimeout(() => {
        cancelLongPress();
        const p = pointerStartRef.current!;
        const page = currentPageRef.current;
        setStamps(prev => ({ ...prev, [page]: [...(prev[page] ?? []), { x: p.x, y: p.y, tipo: "manca" }] }));
        currentStrokeRef.current = [];
      }, LONG_PRESS_MS);
    }
    function onMove(e: PointerEvent) {
      e.preventDefault();
      if (modoRef.current === "zone") {
        if (!pointerStartRef.current || e.buttons === 0) return;
        rettangoloLiveRef.current = rettangolo(pointerStartRef.current, norm(e));
        redrawAnnotations();
        return;
      }
      if (modoRef.current === "vista") {
        // in sola visione il cursore diventa una mano solo sopra una zona cliccabile
        canvas!.style.cursor = zonaSu(norm(e)) ? "pointer" : "default";
        return;
      }
      if (currentStrokeRef.current.length === 0) return;
      const pt = norm(e);
      const start = pointerStartRef.current!;
      if (Math.hypot(pt.x - start.x, pt.y - start.y) > TAP_MOVE_THRESHOLD * 0.5) {
        cancelLongPress();
        isDrawingRef.current = true;
      }
      currentStrokeRef.current.push(pt);
      if (isDrawingRef.current) redrawAnnotations(currentStrokeRef.current);
    }
    function onUp(e: PointerEvent) {
      e.preventDefault();
      const modoAttuale = modoRef.current;
      if (modoAttuale !== "segni") {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        rettangoloLiveRef.current = null;
        if (!start || e.type === "pointercancel") { redrawAnnotations(); return; }
        const end = norm(e);
        const r = rettangolo(start, end);
        if (modoAttuale === "zone" && r.w >= 0.005 && r.h >= 0.005) {
          onZonaCreataRef.current?.({ pagina: currentPageRef.current, ...r });
        } else if (r.w < 0.01 && r.h < 0.01) {
          onZonaClickRef.current?.(zonaSu(end));
        }
        redrawAnnotations();
        return;
      }
      cancelLongPress();
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = [];
      if (stroke.length === 0) return;
      const start = pointerStartRef.current!;
      const end = norm(e);
      const moved = Math.hypot(end.x - start.x, end.y - start.y);
      const page = currentPageRef.current;

      if (moved >= TAP_MOVE_THRESHOLD && isDrawingRef.current) {
        setStrokes(prev => ({ ...prev, [page]: [...(prev[page] ?? []), stroke] }));
        redrawAnnotations();
      } else {
        // tap vicino a un bollo esistente → rimuovilo
        const nearIdx = (stampsRef.current[page] ?? []).findIndex(s => Math.hypot(s.x - end.x, s.y - end.y) < 0.05);
        if (nearIdx >= 0) {
          setStamps(prev => {
            const arr = [...(prev[page] ?? [])];
            arr.splice(nearIdx, 1);
            return { ...prev, [page]: arr };
          });
          lastTapRef.current = null;
        } else {
          // doppio tap → bollo OK
          const now = Date.now();
          const last = lastTapRef.current;
          if (last && now - last.time < DOUBLE_TAP_MS && last.page === page &&
              Math.hypot(end.x - last.x, end.y - last.y) < DOUBLE_TAP_DIST) {
            setStamps(prev => ({ ...prev, [page]: [...(prev[page] ?? []), { x: end.x, y: end.y, tipo: "ok" }] }));
            lastTapRef.current = null;
          } else {
            lastTapRef.current = { time: now, x: end.x, y: end.y, page };
          }
        }
      }
      isDrawingRef.current = false;
    }

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onUp, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [redrawAnnotations]);

  // ── Caricamento file ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await caricaDocumento(url, mimeType, (p) => { if (!cancelled) setProgresso(p); });
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setPdfLoading(false);
      } catch (e) {
        if (!cancelled) { setErrore((e as Error).message); setPdfLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [url, mimeType]);

  // Zoom: l'immagine già disegnata si ingrandisce subito via CSS, il rendering nitido parte solo
  // quando l'utente smette di zoomare (le piante CAD sono pesanti da ridisegnare a ogni passo).
  useEffect(() => {
    if (totalPages === 0) return;
    const b = baseDimRef.current;
    const stessaPagina = ultimaPaginaRef.current === currentPage;
    if (b && stessaPagina) {
      for (const c of [pdfCanvasRef.current, drawCanvasRef.current]) {
        if (!c) continue;
        c.style.width = `${b.w * zoomFactor}px`;
        c.style.height = `${b.h * zoomFactor}px`;
      }
    }
    const t = setTimeout(() => renderPage(currentPage), b && stessaPagina ? ATTESA_ZOOM_MS : 0);
    return () => clearTimeout(t);
  }, [currentPage, zoomFactor, totalPages, renderPage]);
  useEffect(() => { if (totalPages > 0) redrawAnnotations(); }, [strokes, stamps, zone, totalPages, redrawAnnotations]);
  useEffect(() => {
    if (totalPages === 0) return;
    return attachPointerHandlers();
  }, [totalPages, attachPointerHandlers]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(() => { if (pdfDocRef.current) renderPage(currentPageRef.current); }, 200);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderPage]);

  // ── Undo / Pulisci ────────────────────────────────────────────────────────
  function undoUltimoTratto() {
    setStrokes(prev => ({ ...prev, [currentPage]: (prev[currentPage] ?? []).slice(0, -1) }));
  }
  function undoUltimoBollo() {
    setStamps(prev => ({ ...prev, [currentPage]: (prev[currentPage] ?? []).slice(0, -1) }));
  }
  function pulisciPagina() {
    setStrokes(prev => ({ ...prev, [currentPage]: [] }));
    setStamps(prev => ({ ...prev, [currentPage]: [] }));
  }

  const nStamps = Object.values(stamps).reduce((s, arr) => s + arr.length, 0);
  const nStrokes = Object.values(strokes).reduce((s, arr) => s + arr.length, 0);
  const sep = <div style={{ width: 1, height: 18, background: "#E5E4E0" }} />;

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height, overflow: "hidden", background: "#F5F2EE", borderRadius: 8, border: "1px solid #E5E4E0" }}>
      {!pronta && !errore && (
        // copre anche la barra strumenti: finché la pianta non è pronta non si può cliccare nulla
        <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(250,249,247,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "progress" }}>
          <div style={{ width: "min(320px, 70%)", height: 8, borderRadius: 4, background: "#E5E4E0", overflow: "hidden" }}>
            <div className={progresso === null && pdfLoading ? "animate-pulse" : undefined} style={{ height: "100%", borderRadius: 4, background: "#F08F25", width: progresso === null ? "40%" : `${Math.max(4, Math.round((pdfLoading ? progresso : 1) * 100))}%`, transition: "width .2s" }} />
          </div>
          <span style={{ fontSize: 13, color: "#6B6560" }}>
            {pdfLoading ? `Caricamento pianta… ${progresso === null ? "" : `${Math.round(progresso * 100)}%`}` : "Preparazione della pianta…"}
          </span>
        </div>
      )}
      <div style={{ background: "#FAF9F7", borderBottom: "1px solid #E5E4E0", padding: "7px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        {barraExtra}
        {barraExtra && sep}
        {totalPages > 1 && (
          <>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={btnStyle}>‹</button>
            <span style={{ fontSize: 12, color: "#6B6560", minWidth: 60, textAlign: "center" }}>{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages || p, p + 1))} disabled={currentPage >= totalPages} style={btnStyle}>›</button>
            {sep}
          </>
        )}
        <button onClick={() => setZoomFactor(z => Math.max(ZOOM_MIN, +(z - 0.2).toFixed(1)))} style={btnStyle}>−</button>
        <span style={{ fontSize: 11, color: "#6B6560", minWidth: 36, textAlign: "center" }}>{Math.round(zoomFactor * 100)}%</span>
        <button onClick={() => setZoomFactor(z => Math.min(ZOOM_MAX, +(z + 0.2).toFixed(1)))} style={btnStyle}>+</button>
        {!readOnly && (
          <>
            {sep}
            <span style={{ fontSize: 11, color: "#B8960C", fontWeight: 600 }}>✏ {nStrokes}</span>
            <span style={{ fontSize: 11, color: "#2E8B4F", fontWeight: 600 }}>✓ {nStamps}</span>
            {sep}
            <button onClick={undoUltimoTratto} style={btnStyle} title="Annulla ultimo tratto">↩ Tratto</button>
            <button onClick={undoUltimoBollo} style={btnStyle} title="Annulla ultimo bollo">↩ Bollo</button>
            <button onClick={pulisciPagina} style={{ ...btnStyle, color: "#DC2626" }} title="Pulisci pagina">✕ Pagina</button>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: "auto", overflowX: "auto", display: "flex", justifyContent: "flex-start", alignItems: "flex-start", padding: "16px 8px", background: "#E8E4E0" }}
      >
        {pdfLoading ? (
          <div style={{ color: "#6B6560", fontSize: 14, margin: "60px auto 0" }} />
        ) : errore ? (
          <div style={{ color: "#991B1B", fontSize: 14, margin: "60px auto 0" }}>{errore}</div>
        ) : (
          <div style={{ position: "relative", display: "inline-block", margin: "0 auto" }}>
            <canvas ref={pdfCanvasRef} style={{ display: "block", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }} />
            <canvas ref={drawCanvasRef} style={{ position: "absolute", top: 0, left: 0, cursor: modo === "vista" || readOnly ? "default" : "crosshair", touchAction: modo === "vista" || readOnly ? "auto" : "none", userSelect: "none" }} />
          </div>
        )}
      </div>

      {!readOnly && (
        <div style={{ background: "#FAF9F7", borderTop: "1px solid #E5E4E0", padding: "4px 12px", display: "flex", gap: 16, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "#A4A4A6" }}>✏ Trascina = evidenzia</span>
          <span style={{ fontSize: 10, color: "#A4A4A6" }}>✅ Doppio tap = OK</span>
          <span style={{ fontSize: 10, color: "#A4A4A6" }}>🔴 Tieni premuto = Manca</span>
        </div>
      )}
    </div>
  );
}
