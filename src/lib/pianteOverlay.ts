export interface Point { x: number; y: number }
export interface Stamp { x: number; y: number; tipo: "ok" | "manca" }

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

const HIGHLIGHT_OPACITY = 0.55;

export interface OpzioniOverlay {
  pagina: number;
  strokes: Record<number, Point[][]>;
  stamps: Record<number, Stamp[]>;
  zone?: ZonaRender[];
  liveStroke?: Point[];
  liveRect?: { x: number; y: number; w: number; h: number } | null;
  // moltiplicatore per le misure fisse in pixel (bordi, tratteggi): 1 a schermo, più alto quando si
  // disegna su un'immagine molto più grande, come nell'esportazione.
  scala?: number;
}

// Disegna zone, tratti e bolli di una pagina su un contesto in unità W×H. Usato dallo schermo
// (motore di annotazione) e dall'esportazione in PDF, così il risultato è lo stesso.
export function disegnaOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, o: OpzioniOverlay): void {
  const sc = o.scala ?? 1;
  ctx.save();
  const lw = Math.max(14, W * 0.018);
  const pageStrokes = o.strokes[o.pagina] ?? [];
  const allStrokes = o.liveStroke ? [...pageStrokes, o.liveStroke] : pageStrokes;

  // zone (sotto ai segni)
  ctx.globalCompositeOperation = "source-over";
  const fs = Math.max(11, W * 0.011);
  for (const z of o.zone ?? []) {
    if (z.pagina !== o.pagina) continue;
    const zx = z.x * W, zy = z.y * H, zw = z.w * W, zh = z.h * H;
    ctx.globalAlpha = z.tratteggio ? 0.12 : 0.28;
    ctx.fillStyle = z.colore;
    ctx.fillRect(zx, zy, zw, zh);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = z.colore;
    ctx.lineWidth = (z.selezionata ? 4 : 2) * sc;
    ctx.setLineDash(z.tratteggio ? [6 * sc, 4 * sc] : []);
    ctx.strokeRect(zx, zy, zw, zh);
    ctx.setLineDash([]);
    if (z.spuntata) {
      const cs = Math.min(zw, zh, W * 0.05) * 0.5;
      const cx = zx + zw / 2, cy = zy + zh / 2;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = z.colore;
      ctx.lineWidth = Math.max(3 * sc, cs * 0.28);
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
      const tw = Math.min(ctx.measureText(testo).width + 8 * sc, Math.max(zw, 40 * sc));
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = z.colore;
      ctx.fillRect(zx, zy, tw, fs + 6 * sc);
      ctx.fillStyle = "white";
      ctx.save();
      ctx.beginPath(); ctx.rect(zx, zy, tw, fs + 6 * sc); ctx.clip();
      ctx.fillText(testo, zx + 4 * sc, zy + 3 * sc);
      ctx.restore();
    }
  }
  if (o.liveRect) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#F08F25";
    ctx.lineWidth = 2 * sc;
    ctx.setLineDash([6 * sc, 4 * sc]);
    ctx.strokeRect(o.liveRect.x * W, o.liveRect.y * H, o.liveRect.w * W, o.liveRect.h * H);
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
  for (const st of o.stamps[o.pagina] ?? []) {
    const cx = st.x * W;
    const cy = st.y * H;
    const isOk = st.tipo === "ok";
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, 2 * Math.PI);
    ctx.fillStyle = isOk ? "#2E8B4F" : "#CC3333";
    ctx.fill();
    ctx.lineWidth = 2.5 * sc;
    ctx.strokeStyle = "white";
    ctx.stroke();
    ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isOk ? "OK" : "!", cx, cy);
  }
  ctx.restore();
}
