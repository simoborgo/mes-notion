"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type Stamp = { x: number; y: number; tipo: "ok" | "manca" };

interface Props {
  rilavorazionePageId: string;
  sourcePdfPageId: string;
  schedaOdp: string;
  onClose: () => void;
  onSaved: () => void;
}

const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DIST = 0.03;
const TAP_MOVE_THRESHOLD = 0.01;
const LONG_PRESS_MS = 800;
const HIGHLIGHT_OPACITY = 0.55;

export default function PdfAnnotatoreModal({ rilavorazionePageId, sourcePdfPageId, schedaOdp, onClose, onSaved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<unknown>(null);
  const currentPageRef = useRef(1);
  const strokesRef = useRef<Record<number, Point[][]>>({});
  const stampsRef = useRef<Record<number, Stamp[]>>({});
  const currentStrokeRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const pointerStartRef = useRef<Point | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number; page: number } | null>(null);

  const [strokes, setStrokes] = useState<Record<number, Point[][]>>({});
  const [stamps, setStamps] = useState<Record<number, Stamp[]>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { stampsRef.current = stamps; }, [stamps]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function getPdfjsLib() {
    // @ts-expect-error — global cached
    if (window.__pdfjsLib) return window.__pdfjsLib as typeof import("pdfjs-dist");
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    // @ts-expect-error
    window.__pdfjsLib = pdfjsLib;
    return pdfjsLib;
  }

  const redrawAnnotations = useCallback((liveStroke?: Point[]) => {
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = drawCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    const W = drawCanvas.width / dpr;
    const H = drawCanvas.height / dpr;
    const lw = Math.max(14, W * 0.018);

    const pageStrokes = strokesRef.current[currentPageRef.current] ?? [];
    const allStrokes = liveStroke ? [...pageStrokes, liveStroke] : pageStrokes;
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
    const pageStamps = stampsRef.current[currentPageRef.current] ?? [];
    for (const s of pageStamps) {
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

  const renderPage = useCallback(async (pageNum: number) => {
    const pdfjsLib = await getPdfjsLib();
    const pdf = pdfDocRef.current as { getPage: (n: number) => Promise<unknown> } | null;
    if (!pdf) return;
    const page = await pdf.getPage(pageNum);
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!pdfCanvas || !drawCanvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const vp0 = (page as { getViewport: (o: { scale: number }) => { width: number; height: number } }).getViewport({ scale: 1 });
    const scale = (container.clientWidth / vp0.width) * 0.98;
    const vp = (page as { getViewport: (o: { scale: number }) => unknown }).getViewport({ scale });
    const vp2 = vp as { width: number; height: number };

    for (const c of [pdfCanvas, drawCanvas]) {
      c.width = Math.round(vp2.width * dpr);
      c.height = Math.round(vp2.height * dpr);
      c.style.width = `${vp2.width}px`;
      c.style.height = `${vp2.height}px`;
    }

    const ctx = pdfCanvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    await (page as { render: (o: unknown) => { promise: Promise<void> } }).render({ canvasContext: ctx, viewport: vp }).promise;
    redrawAnnotations();
    void pdfjsLib;
  }, [redrawAnnotations]);

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

    function onDown(e: PointerEvent) {
      e.preventDefault();
      canvas!.setPointerCapture(e.pointerId);
      const pt = norm(e);
      pointerStartRef.current = pt;
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
      if (currentStrokeRef.current.length === 0) return;
      const pt = norm(e);
      const start = pointerStartRef.current!;
      const dist = Math.hypot(pt.x - start.x, pt.y - start.y);
      if (dist > TAP_MOVE_THRESHOLD * 0.5) { cancelLongPress(); isDrawingRef.current = true; }
      currentStrokeRef.current.push(pt);
      if (isDrawingRef.current) redrawAnnotations(currentStrokeRef.current);
    }
    function onUp(e: PointerEvent) {
      e.preventDefault();
      cancelLongPress();
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = [];
      if (stroke.length === 0) return;
      const start = pointerStartRef.current!;
      const end = norm(e);
      const moved = Math.hypot(end.x - start.x, end.y - start.y);
      if (moved >= TAP_MOVE_THRESHOLD && isDrawingRef.current) {
        const page = currentPageRef.current;
        setStrokes(prev => ({ ...prev, [page]: [...(prev[page] ?? []), stroke] }));
        redrawAnnotations();
      } else {
        const page = currentPageRef.current;
        const pageStamps = stampsRef.current[page] ?? [];
        const nearIdx = pageStamps.findIndex(s => Math.hypot(s.x - end.x, s.y - end.y) < 0.05);
        if (nearIdx >= 0) {
          setStamps(prev => { const arr = [...(prev[page] ?? [])]; arr.splice(nearIdx, 1); return { ...prev, [page]: arr }; });
          lastTapRef.current = null;
        } else {
          const now = Date.now();
          const last = lastTapRef.current;
          if (last && now - last.time < DOUBLE_TAP_MS && last.page === page && Math.hypot(end.x - last.x, end.y - last.y) < DOUBLE_TAP_DIST) {
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

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    (async () => {
      try {
        const pdfjsLib = await getPdfjsLib();
        const res = await fetch(`/api/verifiche/${sourcePdfPageId}/pdf-originale`);
        if (!res.ok) throw new Error("PDF non trovato nella scheda sorgente");
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        currentPageRef.current = 1;
        setPdfLoading(false);
      } catch (e) {
        if (!cancelled) { setPdfError((e as Error).message); setPdfLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [sourcePdfPageId]);

  useEffect(() => {
    if (!pdfLoading && totalPages > 0) renderPage(currentPage);
  }, [currentPage, totalPages, pdfLoading, renderPage]);

  useEffect(() => {
    if (totalPages > 0) redrawAnnotations();
  }, [strokes, stamps, totalPages, redrawAnnotations]);

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

  function undoLast() {
    const page = currentPage;
    setStrokes(prev => {
      const arr = [...(prev[page] ?? [])];
      arr.pop();
      return { ...prev, [page]: arr };
    });
  }
  function clearPage() {
    setStrokes(prev => ({ ...prev, [currentPage]: [] }));
    setStamps(prev => ({ ...prev, [currentPage]: [] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/schede/${rilavorazionePageId}/annota-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes, stamps, sourcePdfPageId, schedaOdp }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore salvataggio");
      setSaved(true);
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hasAnnotations = Object.values(strokes).some(s => s.length > 0) || Object.values(stamps).some(s => s.length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#1a1a1a" }}>
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b" style={{ background: "#242424", borderColor: "#333" }}>
        <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors" style={{ color: "#aaa" }}>
          ✕
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">Annota PDF — {schedaOdp}</div>
          <div className="text-xs" style={{ color: "#888" }}>
            Disegna per evidenziare · Tieni premuto per segnare MANCA · Doppio tap per OK · Tap su bollo per rimuovere
          </div>
        </div>

        {/* Nav pagine */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}
              className="w-8 h-8 rounded flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-colors text-white text-lg">
              ‹
            </button>
            <span className="text-xs text-white tabular-nums">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}
              className="w-8 h-8 rounded flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-colors text-white text-lg">
              ›
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={undoLast} disabled={!(strokes[currentPage]?.length > 0)}
            className="px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-30 hover:bg-white/10 transition-colors"
            style={{ color: "#ccc", border: "1px solid #444" }}>
            ↩ Annulla
          </button>
          <button onClick={clearPage}
            className="px-2.5 py-1.5 rounded text-xs font-medium hover:bg-white/10 transition-colors"
            style={{ color: "#ccc", border: "1px solid #444" }}>
            Pulisci pagina
          </button>
          {saved ? (
            <span className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: "#065F46", color: "#A7F3D0" }}>
              ✓ Salvato
            </span>
          ) : (
            <button onClick={handleSave} disabled={saving || !hasAnnotations}
              className="px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "#D97706", color: "white" }}>
              {saving ? "Salvataggio…" : "Salva PDF annotato"}
            </button>
          )}
        </div>
      </div>

      {/* PDF area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto flex flex-col items-center py-6 px-4" style={{ background: "#1a1a1a" }}>
        {pdfLoading && (
          <div className="flex items-center justify-center h-40">
            <span className="text-sm animate-pulse" style={{ color: "#aaa" }}>Caricamento PDF…</span>
          </div>
        )}
        {pdfError && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            {pdfError}
          </div>
        )}
        {!pdfLoading && !pdfError && (
          <div className="relative shadow-2xl" style={{ touchAction: "none" }}>
            <canvas ref={pdfCanvasRef} className="block" />
            <canvas ref={drawCanvasRef} className="absolute inset-0 cursor-crosshair" style={{ touchAction: "none" }} />
          </div>
        )}
      </div>
    </div>
  );
}
