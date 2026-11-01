"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPdfjsLib } from "@/lib/pdfjsClient";

// Motore di visualizzazione e annotazione PDF/immagine, portato da SpedizioneVerifica (stesso
// rendering a due canvas, stessi gesti, stesso formato dati per pagina in coordinate 0–1).
// Contiene solo la parte comune: lock, foto e finalizzazione restano della spedizione.

export interface Point { x: number; y: number }
export interface Stamp { x: number; y: number; tipo: "ok" | "manca" }
export interface Annotazioni {
  strokes: Record<number, Point[][]>;
  stamps: Record<number, Stamp[]>;
}

const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DIST = 0.03;
const TAP_MOVE_THRESHOLD = 0.01;
const LONG_PRESS_MS = 800;
const HIGHLIGHT_OPACITY = 0.55;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const MAX_PIXEL = 16_000_000;
const ATTESA_ZOOM_MS = 250;

const btnStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 4, background: "#F5F2EE", color: "#1A1918",
  border: "1px solid #E5E4E0", fontSize: 12, cursor: "pointer",
};

// Interfaccia minima di pdf.js usata dal rendering; le immagini la implementano con un adattatore.
interface PaginaRender {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel?: () => void };
}
interface DocumentoRender { numPages: number; getPage: (n: number) => Promise<PaginaRender> }

async function caricaDocumento(url: string, mimeType: string): Promise<DocumentoRender> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("File non trovato");
  if (mimeType === "application/pdf") {
    const pdfjsLib = await getPdfjsLib();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
    return pdf as unknown as DocumentoRender;
  }
  const bmp = await createImageBitmap(await res.blob());
  return {
    numPages: 1,
    getPage: async () => ({
      getViewport: ({ scale }) => ({ width: bmp.width * scale, height: bmp.height * scale }),
      render: ({ canvasContext, viewport }) => {
        canvasContext.drawImage(bmp, 0, 0, viewport.width, viewport.height);
        return { promise: Promise.resolve() };
      },
    }),
  };
}

// Zona rettangolare già calcolata dal chiamante (colore, etichetta, conteggio ODP): il motore la disegna e basta.
export interface ZonaRender {
  id: string;
  pagina: number;
  x: number; y: number; w: number; h: number;
  colore: string;
  etichetta: string;
  conteggio: number | null;
  selezionata: boolean;
  tratteggio?: boolean;
  spuntata?: boolean; // lavoro completato: segno di spunta al centro
}
// segni = disegno a mano libera e bolli (default, come la spedizione); zone = si trascina un
// rettangolo; vista = i tocchi servono solo a cliccare le zone e il dito può scorrere la pagina.
export type ModoPianta = "segni" | "zone" | "vista";

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
}

export default function PdfAnnotabile({ url, mimeType, iniziali, onChange, readOnly = false, height = "calc(100vh - 220px)", modo = "segni", zone, onZonaCreata, onZonaClick, barraExtra }: Props) {
  const [strokes, setStrokes] = useState<Record<number, Point[][]>>(iniziali?.strokes ?? {});
  const [stamps, setStamps] = useState<Record<number, Stamp[]>>(iniziali?.stamps ?? {});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<DocumentoRender | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const baseDimRef = useRef<{ w: number; h: number } | null>(null);
  const ultimaPaginaRef = useRef(0);
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
    const W = drawCanvas.width / dpr;
    const H = drawCanvas.height / dpr;
    const lw = Math.max(14, W * 0.018);
    const pageStrokes = strokesRef.current[currentPageRef.current] ?? [];
    const allStrokes = liveStroke ? [...pageStrokes, liveStroke] : pageStrokes;

    // zone (sotto ai segni)
    ctx.globalCompositeOperation = "source-over";
    const fs = Math.max(11, W * 0.011);
    for (const z of zoneRef.current ?? []) {
      if (z.pagina !== currentPageRef.current) continue;
      const zx = z.x * W, zy = z.y * H, zw = z.w * W, zh = z.h * H;
      ctx.globalAlpha = z.tratteggio ? 0.12 : 0.28;
      ctx.fillStyle = z.colore;
      ctx.fillRect(zx, zy, zw, zh);
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = z.colore;
      ctx.lineWidth = z.selezionata ? 4 : 2;
      ctx.setLineDash(z.tratteggio ? [6, 4] : []);
      ctx.strokeRect(zx, zy, zw, zh);
      ctx.setLineDash([]);
      if (z.spuntata) {
        const cs = Math.min(zw, zh, W * 0.05) * 0.5;
        const cx = zx + zw / 2, cy = zy + zh / 2;
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = z.colore;
        ctx.lineWidth = Math.max(3, cs * 0.28);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(cx - cs * 0.6, cy);
        ctx.lineTo(cx - cs * 0.15, cy + cs * 0.45);
        ctx.lineTo(cx + cs * 0.65, cy - cs * 0.45);
        ctx.stroke();
      }
      if (z.etichetta || z.conteggio) {
        ctx.font = `bold ${Math.round(fs)}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const testo = [z.etichetta, z.conteggio ? `${z.conteggio} ODP` : ""].filter(Boolean).join(" · ");
        const tw = Math.min(ctx.measureText(testo).width + 8, Math.max(zw, 40));
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = z.colore;
        ctx.fillRect(zx, zy, tw, fs + 6);
        ctx.fillStyle = "white";
        ctx.save();
        ctx.beginPath(); ctx.rect(zx, zy, tw, fs + 6); ctx.clip();
        ctx.fillText(testo, zx + 4, zy + 3);
        ctx.restore();
      }
    }
    const live = rettangoloLiveRef.current;
    if (live) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#F08F25";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(live.x * W, live.y * H, live.w * W, live.h * H);
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = HIGHLIGHT_OPACITY;
    ctx.strokeStyle = "#FFE066";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of allStrokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * W, stroke[0].y * H);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x * W, stroke[i].y * H);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.92;
    const r = Math.max(20, W * 0.028);
    for (const s of stampsRef.current[currentPageRef.current] ?? []) {
      const cx = s.x * W;
      const cy = s.y * H;
      const isOk = s.tipo === "ok";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, 2 * Math.PI);
      ctx.fillStyle = isOk ? "#2E8B4F" : "#CC3333";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "white";
      ctx.stroke();
      ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(isOk ? "OK" : "!", cx, cy);
    }
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
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
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
      if (modoRef.current === "vista") return;
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
        const doc = await caricaDocumento(url, mimeType);
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
    <div style={{ display: "flex", flexDirection: "column", height, overflow: "hidden", background: "#F5F2EE", borderRadius: 8, border: "1px solid #E5E4E0" }}>
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
          <div style={{ color: "#6B6560", fontSize: 14, margin: "60px auto 0" }}>Caricamento…</div>
        ) : errore ? (
          <div style={{ color: "#991B1B", fontSize: 14, margin: "60px auto 0" }}>{errore}</div>
        ) : (
          <div style={{ position: "relative", display: "inline-block", margin: "0 auto" }}>
            <canvas ref={pdfCanvasRef} style={{ display: "block", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }} />
            <canvas ref={drawCanvasRef} style={{ position: "absolute", top: 0, left: 0, cursor: modo === "vista" || readOnly ? "pointer" : readOnly ? "default" : "crosshair", touchAction: modo === "vista" || readOnly ? "auto" : "none", userSelect: "none" }} />
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
