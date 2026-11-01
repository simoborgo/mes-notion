"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommessaPianta } from "@/lib/types";
import { getPdfjsLib } from "@/lib/pdfjsClient";

const MAX_ZOOM = 10;
const MAX_CANVAS_W = 4096;

type View = { s: number; x: number; y: number };

// Pianta a pieno schermo con zoom (rotella, pinch, pulsanti) e pan (trascinamento). Il contenuto
// ha dimensioni fisse (W×H); le coordinate normalizzate 0–1 di zone e segni futuri si appoggiano
// al livello `children`, che segue lo stesso zoom/pan.
export default function PiantaViewer({ pianta, children }: { pianta: CommessaPianta; children?: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ s: 1, x: 0, y: 0 });
  const dimRef = useRef({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [stato, setStato] = useState<"carico" | "ok" | "errore">("carico");

  const url = `/api/drive-file/${pianta.driveFileId}`;
  const isPdf = pianta.mimeType === "application/pdf";

  const applica = useCallback((v: View) => { viewRef.current = v; setView(v); }, []);

  const adatta = useCallback(() => {
    const box = boxRef.current; const { w, h } = dimRef.current;
    if (!box || !w) return;
    const s = Math.min(box.clientWidth / w, box.clientHeight / h) * 0.98;
    applica({ s, x: (box.clientWidth - w * s) / 2, y: (box.clientHeight - h * s) / 2 });
  }, [applica]);

  // Zoom mantenendo fermo il punto (cx, cy) in coordinate del contenitore.
  const zoomSu = useCallback((fattore: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const s = Math.min(MAX_ZOOM, Math.max(0.05, v.s * fattore));
    const k = s / v.s;
    applica({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  }, [applica]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isPdf) {
          const pdfjsLib = await getPdfjsLib();
          const res = await fetch(url);
          if (!res.ok) throw new Error();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
          const page = await pdf.getPage(1);
          const canvas = canvasRef.current;
          if (cancelled || !canvas) return;
          const vp0 = page.getViewport({ scale: 1 });
          const k = Math.min(MAX_CANVAS_W / vp0.width, Math.max(2, (window.devicePixelRatio || 1) * 2));
          const vp = page.getViewport({ scale: k });
          canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
          await page.render({ canvas, viewport: vp }).promise;
          if (cancelled) return;
          dimRef.current = { w: vp0.width, h: vp0.height };
        } else {
          const img = new Image();
          img.src = url;
          await img.decode();
          const canvas = canvasRef.current;
          if (cancelled || !canvas) return;
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);
          dimRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        }
        setDim(dimRef.current);
        setStato("ok");
        adatta();
      } catch {
        if (!cancelled) setStato("errore");
      }
    })();
    return () => { cancelled = true; };
  }, [url, isPdf, adatta]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = box!.getBoundingClientRect();
      zoomSu(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }
    box.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", adatta);
    return () => { box.removeEventListener("wheel", onWheel); window.removeEventListener("resize", adatta); };
  }, [zoomSu, adatta]);

  function onPointerDown(e: React.PointerEvent) {
    boxRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const box = boxRef.current!; const r = box.getBoundingClientRect();
    const attuali = [...pointers.current.values()];
    if (attuali.length === 1) {
      const v = viewRef.current;
      applica({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y });
    } else if (attuali.length === 2) {
      const [a, b] = attuali;
      const distPrima = Math.hypot(a.x - b.x, a.y - b.y);
      const nuovo = { x: e.clientX, y: e.clientY };
      const altro = attuali.find((p) => p !== prev)!;
      const distDopo = Math.hypot(nuovo.x - altro.x, nuovo.y - altro.y);
      if (distPrima > 0) zoomSu(distDopo / distPrima, (nuovo.x + altro.x) / 2 - r.left, (nuovo.y + altro.y) / 2 - r.top);
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onPointerUp(e: React.PointerEvent) { pointers.current.delete(e.pointerId); }

  const centro = () => { const b = boxRef.current!; return [b.clientWidth / 2, b.clientHeight / 2] as const; };
  const btn = "w-9 h-9 rounded border bg-white text-lg leading-none hover:bg-gray-50";

  return (
    <div className="relative rounded-lg border border-gray-200 overflow-hidden" style={{ background: "#EFEBE5", height: "calc(100vh - 220px)", minHeight: 420 }}>
      <div
        ref={boxRef}
        className="absolute inset-0 select-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={adatta}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: dim.w, height: dim.h, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, boxShadow: "0 2px 12px rgba(0,0,0,.18)", background: "#fff" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          {children}
        </div>
      </div>
      {stato === "carico" && <p className="absolute inset-0 flex items-center justify-center text-sm animate-pulse" style={{ color: "var(--color-grey-mid)" }}>Caricamento pianta…</p>}
      {stato === "errore" && <p className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "#991B1B" }}>Pianta non leggibile.</p>}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5" style={{ borderColor: "#E4E0DA" }}>
        <button type="button" className={btn} style={{ borderColor: "#E4E0DA" }} aria-label="Ingrandisci" onClick={() => zoomSu(1.4, ...centro())}>+</button>
        <button type="button" className={btn} style={{ borderColor: "#E4E0DA" }} aria-label="Riduci" onClick={() => zoomSu(1 / 1.4, ...centro())}>−</button>
        <button type="button" className={`${btn} text-xs`} style={{ borderColor: "#E4E0DA" }} aria-label="Adatta alla finestra" onClick={adatta}>⤢</button>
      </div>
      <p className="absolute left-3 bottom-2 text-[11px]" style={{ color: "var(--color-grey-mid)" }}>Rotella o pinch per lo zoom · trascina per spostare · doppio clic per adattare</p>
    </div>
  );
}
