"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface Point { x: number; y: number }
interface Stamp { x: number; y: number; tipo: "ok" | "manca" }
interface FotoRecord { id: string; drive_url: string; drive_id: string }
interface VerificaRecord {
  scheda_numero: string;
  stato: string;
  operatore: string;
  annotazioni?: { strokes?: Record<number, Point[][]>; stamps?: Record<number, Stamp[]>; currentPage?: number; totalPages?: number };
  foto_count: number;
  lock_operatore?: string;
  lock_scadenza?: string;
  notion_page_id?: string;
  pdf_drive_url?: string;
}

interface ListItem {
  notion_page_id: string;
  scheda_numero: string;
  operatore: string;
  foto_count: number;
  lock_operatore?: string;
  updated_at: string;
}

// ── Costanti ──────────────────────────────────────────────────────────────────

const SCHEDA_REGEX = /^MP\d{2}-\d{3}$/i;
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DIST = 0.03;
const TAP_MOVE_THRESHOLD = 0.01;
const LONG_PRESS_MS = 800;
const HIGHLIGHT_OPACITY = 0.55;
const HEARTBEAT_MS = 10 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function compressToDataUrl(file: File, maxDim = 1400, quality = 0.75): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

// ── Componente ────────────────────────────────────────────────────────────────

interface OdpEntry { id: string; odp: string; label: string; isChild: boolean; clienteInfo: string; tipologia: string; statoProdEsterna: string; statoProduzione: string; commessaNr: string }

export default function SpedizioneVerifica({ userName, userRole, odpList: initialOdpList = [] }: { userName: string; userRole?: string; odpList?: OdpEntry[] }) {
  // ── Vista ─────────────────────────────────────────────────────────────────
  const [view, setView] = useState<"lista" | "annotatore">("lista");

  // ── Lista verifiche ───────────────────────────────────────────────────────
  const [lista, setLista] = useState<ListItem[]>([]);
  const [odpList] = useState<OdpEntry[]>(initialOdpList);
  const [filtroCommessa, setFiltroCommessa] = useState("");
  const [searchOdp, setSearchOdp] = useState("");
  const [soloMaterialePronto, setSoloMaterialePronto] = useState(true);
  const [loadingLock, setLoadingLock] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [deletingScheda, setDeletingScheda] = useState<string | null>(null);

  // ── PDF + annotazioni ─────────────────────────────────────────────────────
  const [schedaPageId, setSchedaPageId] = useState(""); // notion_page_id — chiave routing
  const [schedaOdp, setSchedaOdp] = useState("");       // ODP display (es. MP26-057)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [strokes, setStrokes] = useState<Record<number, Point[][]>>({});
  const [stamps, setStamps] = useState<Record<number, Stamp[]>>({});
  const [fotos, setFotos] = useState<FotoRecord[]>([]);
  const [fotoThumb, setFotoThumb] = useState<{ id: string; dataUrl: string }[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Modale finalizzazione ─────────────────────────────────────────────────
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [finalDriveUrl, setFinalDriveUrl] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // pdf.js state stored in refs (not React state — avoids re-renders on every render)
  const pdfDocRef = useRef<unknown>(null);
  const originalBytesRef = useRef<Uint8Array | null>(null);
  const baseScaleRef = useRef(1);
  const lastTapRef = useRef<{ time: number; x: number; y: number; page: number } | null>(null);
  const currentStrokeRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<Point | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mutable mirrors of React state for use inside event handlers
  const strokesRef = useRef(strokes);
  const stampsRef = useRef(stamps);
  const currentPageRef = useRef(currentPage);
  const zoomRef = useRef(zoomFactor);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { stampsRef.current = stamps; }, [stamps]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { zoomRef.current = zoomFactor; }, [zoomFactor]);

  // ── Carica lista all'avvio e ogni volta che torno alla lista ──────────────
  const fetchLista = useCallback(async () => {
    try {
      const r = await fetch("/api/verifiche");
      if (r.ok) { const d = await r.json(); setLista(d.list ?? []); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (view === "lista") fetchLista(); }, [view, fetchLista]);

  // ── pdf.js lazy init ──────────────────────────────────────────────────────
  const getPdfjsLib = useCallback(async () => {
    // @ts-expect-error - pdfjs-dist global
    if (window.__pdfjsLib) return window.__pdfjsLib;
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    // @ts-expect-error
    window.__pdfjsLib = pdfjsLib;
    return pdfjsLib;
  }, []);

  // ── Rendering PDF ─────────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const pdfjsLib = await getPdfjsLib();
    const pdf = pdfDocRef.current as { getPage: (n: number) => Promise<unknown> } | null;
    if (!pdf) return;

    const page = await pdf.getPage(pageNum);
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!pdfCanvas || !drawCanvas || !container) return;

    // @ts-expect-error
    const viewport0 = page.getViewport({ scale: 1 });
    const containerW = container.clientWidth || 360;
    const base = Math.min(3, containerW / viewport0.width);
    baseScaleRef.current = base;

    const eff = base * zoomRef.current;
    // @ts-expect-error
    const vp = page.getViewport({ scale: eff });
    const dpr = window.devicePixelRatio || 1;

    for (const c of [pdfCanvas, drawCanvas]) {
      c.width = vp.width * dpr;
      c.height = vp.height * dpr;
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
    }

    const ctx = pdfCanvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    // @ts-expect-error
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    redrawAnnotations();
  }, [getPdfjsLib]);

  // ── Ridisegno annotazioni ─────────────────────────────────────────────────
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

    // Tratti di evidenziazione
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

    // Bolli
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

  // ── Handlers pointer events ───────────────────────────────────────────────
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
        // long press → bollo "Manca"
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
      if (dist > TAP_MOVE_THRESHOLD * 0.5) {
        cancelLongPress();
        isDrawingRef.current = true;
      }
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
        // salva tratto
        const page = currentPageRef.current;
        setStrokes(prev => ({ ...prev, [page]: [...(prev[page] ?? []), stroke] }));
        redrawAnnotations();
      } else {
        const page = currentPageRef.current;
        // Tap vicino a un bollo esistente → rimuovilo
        const pageStamps = stampsRef.current[page] ?? [];
        const REMOVE_R = 0.05;
        const nearIdx = pageStamps.findIndex(s => Math.hypot(s.x - end.x, s.y - end.y) < REMOVE_R);
        if (nearIdx >= 0) {
          setStamps(prev => {
            const arr = [...(prev[page] ?? [])];
            arr.splice(nearIdx, 1);
            return { ...prev, [page]: arr };
          });
          lastTapRef.current = null;
        } else {
          // check doppio tap → bollo OK
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

  // ── Re-render al cambio zoom/pagina ──────────────────────────────────────
  useEffect(() => {
    if (view === "annotatore" && pdfDocRef.current) renderPage(currentPage);
  }, [currentPage, zoomFactor, view, renderPage]);

  // ── Ri-disegna annotazioni quando strokes/stamps cambiano ─────────────────
  useEffect(() => {
    if (view === "annotatore") redrawAnnotations();
  }, [strokes, stamps, view, redrawAnnotations]);

  // ── Attach handlers quando appare il canvas ───────────────────────────────
  // totalPages cambia in batch con pdfLoading=false: a quel punto il canvas
  // è nel DOM e drawCanvasRef.current è valorizzato.
  useEffect(() => {
    if (view !== "annotatore" || totalPages === 0) return;
    const cleanup = attachPointerHandlers();
    return cleanup;
  }, [view, attachPointerHandlers, totalPages]);

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(() => { if (pdfDocRef.current) renderPage(currentPageRef.current); }, 200);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderPage]);

  // ── Helper salvataggio progresso ──────────────────────────────────────────
  const saveProgress = useCallback((pageId: string, tp: number, fc: number) => {
    return fetch(`/api/verifiche/${pageId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strokes: strokesRef.current,
        stamps: stampsRef.current,
        currentPage: currentPageRef.current,
        totalPages: tp,
        fotoCount: fc,
      }),
    }).catch(() => {});
  }, []);

  // ── Heartbeat (rinnova lock ogni 10 min) ──────────────────────────────────
  useEffect(() => {
    if (view !== "annotatore" || !schedaPageId) return;
    heartbeatRef.current = setInterval(
      () => saveProgress(schedaPageId, totalPages, fotos.length),
      HEARTBEAT_MS
    );
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [view, schedaPageId, totalPages, fotos.length, saveProgress]);

  // ── Salvataggio debounced (2s dopo ogni modifica annotazioni) ─────────────
  useEffect(() => {
    if (view !== "annotatore" || !schedaPageId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(
      () => saveProgress(schedaPageId, totalPages, fotos.length),
      2000
    );
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [strokes, stamps, view, schedaPageId, totalPages, fotos.length, saveProgress]);

  // ── Apri scheda ───────────────────────────────────────────────────────────
  // pageId = notion_page_id (chiave routing); odp = ODP display (es. MP26-057)
  async function apriScheda(pageId: string, odp?: string) {
    setLoadingLock(true);
    setLockError(null);

    try {
      const lockRes = await fetch(`/api/verifiche/${pageId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedaNumero: odp ?? null }),
      });
      const lockData = await lockRes.json();

      if (lockRes.status === 423) {
        const scad = lockData.lockScadenza ? ` fino alle ${formatTime(lockData.lockScadenza)}` : "";
        setLockError(`Scheda in uso da ${lockData.lockedBy}${scad}. Riprova più tardi.`);
        setLoadingLock(false);
        return;
      }
      if (!lockRes.ok) { setLockError(lockData.error ?? "Errore apertura scheda"); setLoadingLock(false); return; }

      // Recupera stato esistente
      const stateRes = await fetch(`/api/verifiche/${pageId}`);
      const stateData = stateRes.ok ? await stateRes.json() : null;
      const record: VerificaRecord | null = stateData?.record ?? null;
      const fotoRows: FotoRecord[] = stateData?.foto ?? [];

      if (record?.annotazioni) {
        const ann = record.annotazioni;
        if (ann.strokes) setStrokes(ann.strokes as Record<number, Point[][]>);
        if (ann.stamps) setStamps(ann.stamps as Record<number, Stamp[]>);
        if (ann.currentPage) setCurrentPage(ann.currentPage);
      } else {
        setStrokes({}); setStamps({}); setCurrentPage(1);
      }
      setFotos(fotoRows);
      setFotoThumb([]);

      // Carica PDF — pageId = notion_page_id, usato direttamente dal route
      setPdfLoading(true);
      setSchedaPageId(pageId);
      setSchedaOdp(odp ?? (record as unknown as Record<string, unknown>)?.scheda_numero as string ?? pageId);
      setView("annotatore");

      try {
        const pdfRes = await fetch(`/api/verifiche/${pageId}/pdf-originale`);
        if (!pdfRes.ok) throw new Error("PDF non trovato su Notion per questa scheda");
        const buf = await pdfRes.arrayBuffer();
        // FIX: copia separata per pdf-lib — pdf.js trasferisce l'ArrayBuffer al worker (detach)
        originalBytesRef.current = new Uint8Array(buf.slice(0));

        const pdfjsLib = await getPdfjsLib();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        const targetPage = record?.annotazioni?.currentPage ?? 1;
        setCurrentPage(targetPage);
        requestAnimationFrame(() => renderPage(targetPage));
      } catch (pdfErr) {
        console.error(pdfErr);
      } finally {
        setPdfLoading(false);
      }
    } catch (err) {
      setLockError((err as Error).message);
    } finally {
      setLoadingLock(false);
    }
  }

  // ── Chiudi scheda ─────────────────────────────────────────────────────────
  async function chiudiScheda() {
    if (schedaPageId) {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveProgress(schedaPageId, totalPages, fotos.length);
      await fetch(`/api/verifiche/${schedaPageId}/lock`, { method: "DELETE" }).catch(() => {});
    }
    pdfDocRef.current = null;
    originalBytesRef.current = null;
    setSchedaPageId("");
    setSchedaOdp("");
    setStrokes({}); setStamps({}); setFotos([]); setFotoThumb([]);
    setCurrentPage(1); setTotalPages(0); setZoomFactor(1);
    setFinalDriveUrl(null); setFinalError(null);
    setView("lista");
  }

  // ── Undo / Pulisci ────────────────────────────────────────────────────────
  function undoUltimoTrattato() {
    setStrokes(prev => {
      const p = { ...prev };
      if (p[currentPage]?.length) { p[currentPage] = p[currentPage].slice(0, -1); }
      return p;
    });
  }
  function undoUltimoBollo() {
    setStamps(prev => {
      const p = { ...prev };
      if (p[currentPage]?.length) { p[currentPage] = p[currentPage].slice(0, -1); }
      return p;
    });
  }
  function pulisciPagina() {
    setStrokes(prev => ({ ...prev, [currentPage]: [] }));
    setStamps(prev => ({ ...prev, [currentPage]: [] }));
  }

  // ── Upload foto ───────────────────────────────────────────────────────────
  async function onFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";

    for (const file of files) {
      const dataUrl = await compressToDataUrl(file, 1400, 0.75);
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      setFotoThumb(prev => [...prev, { id: tempId, dataUrl }]);

      const formData = new FormData();
      // Converti dataUrl → Blob per l'upload
      const res0 = await fetch(dataUrl);
      const blob = await res0.blob();
      formData.append("foto", blob, "foto.jpg");

      try {
        const r = await fetch(`/api/verifiche/${schedaPageId}/foto`, { method: "POST", body: formData });
        const d = await r.json();
        if (r.ok && d.foto) {
          setFotos(prev => [...prev, d.foto as FotoRecord]);
          setFotoThumb(prev => prev.filter(t => t.id !== tempId));
        }
      } catch (err) {
        console.error("Upload foto fallito:", err);
        setFotoThumb(prev => prev.filter(t => t.id !== tempId));
      }
    }
  }

  async function rimuoviFoto(fotoId: string, driveId: string) {
    try {
      await fetch(`/api/verifiche/${schedaPageId}/foto/${fotoId}`, { method: "DELETE" });
      setFotos(prev => prev.filter(f => f.id !== fotoId));
    } catch { /* ignore */ }
    void driveId;
  }

  // ── Finalizzazione ────────────────────────────────────────────────────────
  async function finalizza() {
    setFinalizing(true);
    setFinalError(null);

    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

      if (!originalBytesRef.current) throw new Error("PDF originale non caricato");
      const pdfDocLib = await PDFDocument.load(originalBytesRef.current);
      const pages = pdfDocLib.getPages();
      const helveticaBold = await pdfDocLib.embedFont(StandardFonts.HelveticaBold);
      const helvetica = await pdfDocLib.embedFont(StandardFonts.Helvetica);

      // Applica tratti e bolli a ogni pagina
      for (const [pageNumStr, pageStrokes] of Object.entries(strokes)) {
        const pageNum = parseInt(pageNumStr, 10);
        if (pageNum < 1 || pageNum > pages.length) continue;
        const page = pages[pageNum - 1];
        const { width, height } = page.getSize();

        for (const stroke of pageStrokes) {
          if (stroke.length < 2) continue;
          const lw = Math.max(10, width * 0.014);
          for (let i = 1; i < stroke.length; i++) {
            page.drawLine({
              start: { x: stroke[i - 1].x * width, y: height - stroke[i - 1].y * height },
              end: { x: stroke[i].x * width, y: height - stroke[i].y * height },
              thickness: lw,
              color: rgb(1, 0.88, 0.4),
              opacity: 0.55,
            });
          }
        }
      }

      for (const [pageNumStr, pageStamps] of Object.entries(stamps)) {
        const pageNum = parseInt(pageNumStr, 10);
        if (pageNum < 1 || pageNum > pages.length) continue;
        const page = pages[pageNum - 1];
        const { width, height } = page.getSize();
        const r = Math.max(18, width * 0.028);

        for (const s of pageStamps) {
          const cx = s.x * width;
          const cy = height - s.y * height;
          const isOk = s.tipo === "ok";
          page.drawEllipse({
            x: cx, y: cy, xScale: r, yScale: r,
            color: isOk ? rgb(0.18, 0.545, 0.31) : rgb(0.8, 0.2, 0.2),
            opacity: 0.92,
            borderColor: rgb(1, 1, 1), borderWidth: 2,
          });
          const label = isOk ? "OK" : "!";
          const fs = Math.round(r * 0.7);
          const tw = helveticaBold.widthOfTextAtSize(label, fs);
          page.drawText(label, {
            x: cx - tw / 2, y: cy - fs * 0.35,
            size: fs, font: helveticaBold, color: rgb(1, 1, 1),
          });
        }
      }

      // Firma operatore sull'ultima pagina
      const lastPage = pages[pages.length - 1];
      const { width: lw2, height: lh2 } = lastPage.getSize();
      const now = new Date().toLocaleString("it-IT");
      const firma = `Verificato da: ${userName} — ${now}`;
      lastPage.drawRectangle({ x: 20, y: 10, width: lw2 - 40, height: 20, color: rgb(0.95, 0.95, 0.95), opacity: 0.8 });
      lastPage.drawText(firma, { x: 24, y: 15, size: 8, font: helvetica, color: rgb(0.3, 0.3, 0.3) });

      // Pagine foto
      for (let i = 0; i < fotoThumb.length; i++) {
        // foto già caricate su Drive ma il thumb è ancora in mem
        const dataUrl = fotoThumb[i]?.dataUrl;
        if (!dataUrl) continue;
        const jpegRes = await fetch(dataUrl);
        const jpegBytes = new Uint8Array(await jpegRes.arrayBuffer());
        const img = await pdfDocLib.embedJpg(jpegBytes);
        const pg = pdfDocLib.addPage([595, 842]);
        const margin = 40;
        const maxW = 595 - margin * 2;
        const maxH = 842 - margin * 2 - 20;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        pg.drawText(`Foto ${i + 1} — ${schedaOdp || schedaPageId}`, { x: margin, y: 842 - margin - 14, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
        pg.drawImage(img, { x: margin, y: (842 - margin - ih) / 2, width: iw, height: ih });
      }

      const pdfBytes = await pdfDocLib.save();
      const pdfCopy = new Uint8Array(pdfBytes.length);
      pdfCopy.set(pdfBytes);
      const pdfBlob = new Blob([pdfCopy], { type: "application/pdf" });

      const fd = new FormData();
      fd.append("pdf", pdfBlob, `verifica-${schedaOdp || schedaPageId}.pdf`);

      const r = await fetch(`/api/verifiche/${schedaPageId}/finalize`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Errore finalizzazione");

      setFinalDriveUrl(d.driveUrl ?? null);
      setShowFinalModal(false);
    } catch (err) {
      setFinalError((err as Error).message);
    } finally {
      setFinalizing(false);
    }
  }

  const nStamps = Object.values(stamps).reduce((s, arr) => s + arr.length, 0);
  const nStrokes = Object.values(strokes).reduce((s, arr) => s + arr.length, 0);

  async function eliminaScheda(pageId: string, odp?: string) {
    if (!confirm(`Eliminare definitivamente la scheda ${odp ?? pageId}? Questa operazione non è reversibile.`)) return;
    setDeletingScheda(pageId);
    try {
      const r = await fetch(`/api/verifiche/${pageId}`, { method: "DELETE" });
      if (r.ok) await fetchLista();
    } finally {
      setDeletingScheda(null);
    }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  if (view === "lista") {
    return (
      <div style={{ padding: "24px 20px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#1A1918", fontFamily: "var(--font-display, Georgia, serif)" }}>
          Spedizione Merci
        </h1>

        {/* Tabella selezione schede */}
        <div style={{ background: "white", borderRadius: 8, marginBottom: 28, border: "1px solid #E5E4E0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          {/* Filtri */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #E5E4E0", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={searchOdp}
              onChange={e => setSearchOdp(e.target.value.toUpperCase())}
              placeholder="Cerca ODP…"
              style={{ padding: "7px 10px", borderRadius: 4, border: "1px solid #E5E4E0", background: "#FAF9F7", fontSize: 13, fontFamily: "monospace", minWidth: 120, outline: "none" }}
            />
            <select
              value={filtroCommessa}
              onChange={e => setFiltroCommessa(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 4, border: "1px solid #E5E4E0", background: "#FAF9F7", fontSize: 13, minWidth: 140, outline: "none", color: "#1A1918" }}
            >
              <option value="">Tutte le commesse</option>
              {[...new Set(odpList.map(e => e.commessaNr).filter(Boolean))].sort().map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6B6560", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={soloMaterialePronto}
                onChange={e => setSoloMaterialePronto(e.target.checked)}
                style={{ accentColor: "#F08F25" }}
              />
              Solo "Materiale Pronto"
            </label>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#A4A4A6" }}>
              {odpList.filter(e => {
                if (soloMaterialePronto && e.statoProduzione !== "Materiale Pronto") return false;
                if (filtroCommessa && e.commessaNr !== filtroCommessa) return false;
                if (searchOdp && !`${e.odp} ${e.label} ${e.clienteInfo}`.toUpperCase().includes(searchOdp)) return false;
                return true;
              }).length} schede
            </span>
          </div>

          {/* Tabella */}
          {lockError && <p style={{ color: "#DC2626", fontSize: 13, padding: "8px 16px", borderBottom: "1px solid #E5E4E0" }}>{lockError}</p>}
          <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#FAF9F7", position: "sticky", top: 0 }}>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, color: "#6B6560", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E4E0" }}>ODP</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, color: "#6B6560", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E4E0" }}>Commessa</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, color: "#6B6560", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E4E0" }}>Cliente</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, color: "#6B6560", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E4E0" }}>Tipologia</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, color: "#6B6560", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E4E0" }}>Stato</th>
                  <th style={{ padding: "8px 14px", borderBottom: "1px solid #E5E4E0" }} />
                </tr>
              </thead>
              <tbody>
                {odpList.filter(e => {
                  if (soloMaterialePronto && e.statoProduzione !== "Materiale Pronto") return false;
                  if (filtroCommessa && e.commessaNr !== filtroCommessa) return false;
                  if (searchOdp && !`${e.odp} ${e.label} ${e.clienteInfo}`.toUpperCase().includes(searchOdp)) return false;
                  return true;
                }).map(e => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: "1px solid #F0EDE8" }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "#FFF7ED")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = "white")}
                  >
                    <td style={{ padding: "9px 14px", paddingLeft: e.isChild ? 28 : 14 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: e.isChild ? 400 : 700, color: "#1A1918" }}>
                        {e.isChild && <span style={{ color: "#A4A4A6", marginRight: 4 }}>↳</span>}
                        {e.odp}
                      </span>
                      {e.label && <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>{e.label}</span>}
                    </td>
                    <td style={{ padding: "9px 14px", color: "#6B6560" }}>{e.commessaNr || "—"}</td>
                    <td style={{ padding: "9px 14px", color: "#6B6560", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.clienteInfo || "—"}</td>
                    <td style={{ padding: "9px 14px" }}>
                      {e.tipologia && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: "#F3F4F6", color: "#6B7280" }}>{e.tipologia}</span>}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      {e.statoProdEsterna ? (
                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, fontWeight: 500, background: e.statoProdEsterna === "In Lavorazione" ? "#FEF3C7" : "#D1FAE5", color: e.statoProdEsterna === "In Lavorazione" ? "#92400E" : "#065F46" }}>{e.statoProdEsterna}</span>
                      ) : e.statoProduzione ? (
                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: "#F0FDF4", color: "#166534" }}>{e.statoProduzione}</span>
                      ) : null}
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>
                      <button
                        onClick={() => apriScheda(e.id, e.odp)}
                        disabled={loadingLock}
                        style={{ padding: "5px 14px", borderRadius: 4, background: "#F08F25", color: "white", fontWeight: 600, fontSize: 12, border: "none", cursor: "pointer", opacity: loadingLock ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        {loadingLock ? "…" : "Apri"}
                      </button>
                    </td>
                  </tr>
                ))}
                {odpList.filter(e => {
                  if (soloMaterialePronto && e.statoProduzione !== "Materiale Pronto") return false;
                  if (filtroCommessa && e.commessaNr !== filtroCommessa) return false;
                  if (searchOdp && !`${e.odp} ${e.label} ${e.clienteInfo}`.toUpperCase().includes(searchOdp)) return false;
                  return true;
                }).length === 0 && (
                  <tr><td colSpan={6} style={{ padding: "24px 14px", textAlign: "center", color: "#A4A4A6", fontSize: 13 }}>Nessuna scheda trovata</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lista verifiche in corso */}
        <h2 style={{ fontSize: 11, fontWeight: 600, color: "#A4A4A6", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Verifiche in corso
        </h2>
        {lista.length === 0 ? (
          <p style={{ color: "#6B6560", fontSize: 14 }}>Nessuna verifica aperta.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lista.map(item => (
              <div
                key={item.notion_page_id}
                style={{ background: "white", border: "1px solid #E5E4E0", borderRadius: 6, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <div>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1A1918", fontSize: 14 }}>{item.scheda_numero ?? item.notion_page_id}</span>
                  <span style={{ color: "#6B6560", fontSize: 12, marginLeft: 10 }}>
                    {item.operatore} · {item.foto_count} foto · {formatTime(item.updated_at)}
                  </span>
                  {item.lock_operatore && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#F08F25" }}>🔒 {item.lock_operatore}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => apriScheda(item.notion_page_id, item.scheda_numero)}
                    style={{ padding: "5px 14px", borderRadius: 4, background: "#F5F2EE", color: "#1A1918", border: "1px solid #E5E4E0", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                  >
                    Riprendi
                  </button>
                  {userRole === "admin" && (
                    <button
                      onClick={() => eliminaScheda(item.notion_page_id, item.scheda_numero)}
                      disabled={deletingScheda === item.notion_page_id}
                      style={{ padding: "5px 10px", borderRadius: 4, background: "white", color: "#DC2626", border: "1px solid #FECACA", fontSize: 13, cursor: "pointer" }}
                      title="Elimina scheda"
                    >
                      {deletingScheda === item.notion_page_id ? "…" : "✕"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── VISTA ANNOTATORE ──────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", overflow: "hidden", background: "#F5F2EE" }}>

      {/* Header scheda */}
      <div style={{ background: "white", borderBottom: "1px solid #E5E4E0", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
        <button onClick={chiudiScheda} style={{ padding: "6px 12px", borderRadius: 4, background: "#F5F2EE", color: "#6B6560", border: "1px solid #E5E4E0", fontSize: 12, cursor: "pointer" }}>
          ← Elenco
        </button>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#1A1918" }}>{schedaOdp || schedaPageId}</span>
        <span style={{ fontSize: 12, color: "#A4A4A6", flex: 1 }}>{userName}</span>
        {finalDriveUrl ? (
          <a href={finalDriveUrl} target="_blank" rel="noreferrer" style={{ padding: "6px 14px", borderRadius: 4, background: "#2E8B4F", color: "white", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
            ✅ Apri PDF Drive
          </a>
        ) : (
          <button
            onClick={() => setShowFinalModal(true)}
            disabled={totalPages === 0}
            style={{ padding: "6px 16px", borderRadius: 4, background: "#F08F25", color: "white", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", opacity: totalPages === 0 ? 0.5 : 1 }}
          >
            Finalizza
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ background: "#FAF9F7", borderBottom: "1px solid #E5E4E0", padding: "7px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={btnStyle}>‹</button>
        <span style={{ fontSize: 12, color: "#6B6560", minWidth: 60, textAlign: "center" }}>
          {totalPages ? `${currentPage} / ${totalPages}` : "—"}
        </span>
        <button onClick={() => setCurrentPage(p => Math.min(totalPages || p, p + 1))} disabled={currentPage >= totalPages} style={btnStyle}>›</button>

        <div style={{ width: 1, height: 18, background: "#E5E4E0" }} />

        <button onClick={() => setZoomFactor(z => Math.max(0.5, +(z - 0.2).toFixed(1)))} style={btnStyle}>−</button>
        <span style={{ fontSize: 11, color: "#6B6560", minWidth: 36, textAlign: "center" }}>{Math.round(zoomFactor * 100)}%</span>
        <button onClick={() => setZoomFactor(z => Math.min(2.5, +(z + 0.2).toFixed(1)))} style={btnStyle}>+</button>

        <div style={{ width: 1, height: 18, background: "#E5E4E0" }} />

        <span style={{ fontSize: 11, color: "#B8960C", fontWeight: 600 }}>✏ {nStrokes}</span>
        <span style={{ fontSize: 11, color: "#2E8B4F", fontWeight: 600 }}>✓ {nStamps}</span>

        <div style={{ width: 1, height: 18, background: "#E5E4E0" }} />

        <button onClick={undoUltimoTrattato} style={btnStyle} title="Annulla ultimo tratto">↩ Tratto</button>
        <button onClick={undoUltimoBollo} style={btnStyle} title="Annulla ultimo bollo">↩ Bollo</button>
        <button onClick={pulisciPagina} style={{ ...btnStyle, color: "#DC2626" }} title="Pulisci pagina">✕ Pagina</button>
      </div>

      {/* Striscia foto */}
      <div style={{ background: "white", borderBottom: "1px solid #E5E4E0", padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, overflowX: "auto", flexShrink: 0 }}>
        <button
          onClick={() => photoInputRef.current?.click()}
          style={{ padding: "5px 12px", borderRadius: 4, background: "#F5F2EE", color: "#F08F25", border: "1px solid #E5E4E0", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600 }}
        >
          📷 Aggiungi foto
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={onFotoChange} />

        {fotos.map(f => (
          <div key={f.id} style={{ position: "relative", flexShrink: 0 }}>
            <a href={f.drive_url} target="_blank" rel="noreferrer">
              <div style={{ width: 48, height: 48, borderRadius: 4, background: "#F5F2EE", border: "1px solid #E5E4E0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                🖼
              </div>
            </a>
            <button
              onClick={() => rimuoviFoto(f.id, f.drive_id)}
              style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: 8, background: "#DC2626", color: "white", border: "none", fontSize: 10, cursor: "pointer", lineHeight: "16px", textAlign: "center", padding: 0 }}
            >×</button>
          </div>
        ))}

        {fotoThumb.map(t => (
          <div key={t.id} style={{ position: "relative", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.dataUrl} alt="" style={{ width: 48, height: 48, borderRadius: 4, objectFit: "cover", opacity: 0.5, border: "1px solid #F08F25" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#F08F25" }}>⏳</div>
          </div>
        ))}
      </div>

      {/* Area PDF */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: "auto", overflowX: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "16px 8px", background: "#E8E4E0" }}
      >
        {pdfLoading ? (
          <div style={{ color: "#6B6560", fontSize: 14, marginTop: 60 }}>Caricamento PDF…</div>
        ) : !pdfDocRef.current ? (
          <div style={{ color: "#6B6560", fontSize: 14, marginTop: 60, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            PDF non disponibile.<br />
            <span style={{ fontSize: 12 }}>Assicurati che la scheda abbia il PDF allegato su Notion (property &quot;Scheda PDF&quot;).</span>
          </div>
        ) : (
          <div style={{ position: "relative", display: "inline-block" }}>
            <canvas ref={pdfCanvasRef} style={{ display: "block", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }} />
            <canvas
              ref={drawCanvasRef}
              style={{ position: "absolute", top: 0, left: 0, cursor: "crosshair", touchAction: "none", userSelect: "none" }}
            />
          </div>
        )}
      </div>

      {/* Legenda gesti */}
      <div style={{ background: "#FAF9F7", borderTop: "1px solid #E5E4E0", padding: "4px 12px", display: "flex", gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: "#A4A4A6" }}>✏ Trascina = evidenzia</span>
        <span style={{ fontSize: 10, color: "#A4A4A6" }}>✅ Doppio tap = OK</span>
        <span style={{ fontSize: 10, color: "#A4A4A6" }}>🔴 Tieni premuto = Manca</span>
      </div>

      {/* Modale finalizzazione */}
      {showFinalModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,24,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "white", borderRadius: 8, padding: 28, maxWidth: 420, width: "100%", border: "1px solid #E5E4E0", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A1918", marginBottom: 8 }}>Finalizza verifica</h3>
            <p style={{ fontSize: 13, color: "#6B6560", marginBottom: 20 }}>
              Il PDF con tratti, bolli e firme verrà caricato su Drive e Notion. L&apos;operazione non è reversibile.
            </p>
            <div style={{ fontSize: 13, color: "#6B6560", marginBottom: 20, background: "#F5F2EE", borderRadius: 6, padding: "12px 14px" }}>
              <div>Scheda: <strong style={{ color: "#1A1918" }}>{schedaOdp || schedaPageId}</strong></div>
              <div>Operatore: <strong style={{ color: "#1A1918" }}>{userName}</strong></div>
              <div>Tratti: {nStrokes} · Bolli: {nStamps} · Foto: {fotos.length}</div>
            </div>
            {finalError && <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{finalError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowFinalModal(false)} disabled={finalizing} style={{ ...btnStyle, padding: "8px 18px" }}>
                Annulla
              </button>
              <button onClick={finalizza} disabled={finalizing} style={{ padding: "8px 20px", borderRadius: 4, background: "#2E8B4F", color: "white", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
                {finalizing ? "Caricamento…" : "Conferma e finalizza"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stili condivisi ───────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 4,
  background: "#F5F2EE",
  color: "#1A1918",
  border: "1px solid #E5E4E0",
  fontSize: 12,
  cursor: "pointer",
};
