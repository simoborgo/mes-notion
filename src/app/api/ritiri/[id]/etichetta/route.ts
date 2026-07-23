import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import QRCode from "qrcode";
import { getRitiroById, getSchedaById, getCommessaById } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function truncate(s: string, maxLen: number) {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "..." : s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = font.widthOfTextAtSize(word, size) > maxWidth
        ? truncate(word, Math.floor(word.length * maxWidth / font.widthOfTextAtSize(word, size)))
        : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const ritiro = await getRitiroById(id);

    let schedaOdp = ritiro.numeroOrdine;
    let nScheda = "";
    let clienteInfo = "";
    let clienteLocalita = "";
    let clienteInfoExtra = "";

    if (ritiro.numeroOrdineId) {
      try {
        const scheda = await getSchedaById(ritiro.numeroOrdineId);
        schedaOdp = scheda.odp || ritiro.numeroOrdine;
        nScheda = scheda.numeroScheda || "";
        clienteInfo = scheda.clienteInfo || "";
        if (!clienteInfo && scheda.parentId) {
          const parent = await getSchedaById(scheda.parentId);
          clienteInfo = parent.clienteInfo || "";
        }
      } catch { /* fallback */ }
    } else if (!schedaOdp && ritiro.commessaId) {
      try {
        const commessa = await getCommessaById(ritiro.commessaId);
        schedaOdp = commessa.numeroCommessa;
        clienteInfo = commessa.cliente || "";
        clienteLocalita = commessa.localita || "";
        clienteInfoExtra = commessa.info || "";
      } catch { /* fallback */ }
    } else if (!schedaOdp && ritiro.commessaNr) {
      schedaOdp = ritiro.commessaNr;
    }

    // QR code
    const qrPng = await QRCode.toBuffer(ritiro.notionUrl, {
      type: "png", width: 200, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    // Prima foto (opzionale)
    let firstPhoto: Uint8Array | null = null;
    if (ritiro.foto.length > 0) {
      try {
        const res = await fetch(ritiro.foto[0].url);
        if (res.ok) firstPhoto = new Uint8Array(await res.arrayBuffer());
      } catch { /* skip */ }
    }

    const doc = await PDFDocument.create();
    const page = doc.addPage(PageSizes.A4);
    const { width, height } = page.getSize(); // 595 × 842 pt
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const isRitiro = ritiro.tipoMovimento === "Ritiro";
    const badgeBg = isRitiro ? hexToRgb("#3F8F5B") : hexToRgb("#7A2E3A");
    // Helvetica non ha frecce unicode — usiamo < > ASCII
    const badgeText = isRitiro ? "< RIENTRATO DA FORNITORE" : "IN USCITA AL FORNITORE >";
    const margin = 36;

    // ── Striscia superiore (#8B7B6B, ~7mm) ──────────────────
    const stripH = 20;
    page.drawRectangle({ x: 0, y: height - stripH, width, height: stripH, color: hexToRgb("#8B7B6B") });

    // ── Header: MODAR a sx, badge tipo a dx ─────────────────
    const headerH = 56;
    const headerY = height - stripH - headerH;
    page.drawText("MODAR", {
      x: margin,
      y: headerY + (headerH - 28) / 2,
      size: 28, font: bold, color: hexToRgb("#1A1918"),
    });

    const badgeTxtSize = 12;
    const badgePadX = 12;
    const badgePadY = 8;
    const badgeTxtW = bold.widthOfTextAtSize(badgeText, badgeTxtSize);
    const badgeW = badgeTxtW + badgePadX * 2;
    const badgeH2 = badgeTxtSize + badgePadY * 2;
    const badgeX = width - margin - badgeW;
    const badgeY = headerY + (headerH - badgeH2) / 2;
    page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: badgeH2, color: badgeBg });
    page.drawText(badgeText, {
      x: badgeX + badgePadX, y: badgeY + badgePadY + 1,
      size: badgeTxtSize, font: bold, color: rgb(1, 1, 1),
    });

    // Linea separatrice sotto header
    page.drawLine({
      start: { x: 0, y: headerY }, end: { x: width, y: headerY },
      thickness: 0.5, color: hexToRgb("#E4E0DA"),
    });

    // ── Banda data trasporto (crema) ─────────────────────────
    const dataBandH = 44;
    const dataBandY = headerY - dataBandH;
    page.drawRectangle({ x: 0, y: dataBandY, width, height: dataBandH, color: hexToRgb("#FFFBEB") });

    const dataStr = (() => {
      if (!ritiro.dataTrasporto) return "--";
      const dt = new Date(ritiro.dataTrasporto);
      const dateStr = dt.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
      if (ritiro.dataTrasporto.includes("T")) {
        const h = dt.getHours(), m = dt.getMinutes();
        if (h !== 0 || m !== 0) return `${dateStr}   ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      }
      return dateStr;
    })();

    page.drawText("DATA TRASPORTO PREVISTO", {
      x: margin, y: dataBandY + dataBandH - 14,
      size: 7, font: bold, color: hexToRgb("#92400E"),
    });
    page.drawText(dataStr, {
      x: margin, y: dataBandY + 10,
      size: 16, font: bold, color: hexToRgb("#78350F"),
    });

    // Collo N / Tot (destra nella banda data)
    if (ritiro.nrCollo != null || ritiro.totColli != null) {
      const colloVal = `${ritiro.nrCollo ?? "--"} / ${ritiro.totColli ?? "--"}`;
      const colloValSize = 18;
      const colloLabelStr = "COLLO";
      const colloValW = bold.widthOfTextAtSize(colloVal, colloValSize);
      const colloLabelW = bold.widthOfTextAtSize(colloLabelStr, 7);
      const colloX = width - margin - Math.max(colloValW, colloLabelW);
      page.drawText(colloLabelStr, {
        x: colloX, y: dataBandY + dataBandH - 14,
        size: 7, font: bold, color: hexToRgb("#92400E"),
      });
      page.drawText(colloVal, {
        x: colloX, y: dataBandY + 10,
        size: colloValSize, font: bold, color: hexToRgb("#78350F"),
      });
    }

    let y = dataBandY - 14;

    // ── ODP / Codice ─────────────────────────────────────────
    const odpStr = schedaOdp || "--";
    const odpSize = 64;
    const odpW = bold.widthOfTextAtSize(odpStr, odpSize);
    page.drawText(odpStr, {
      x: (width - odpW) / 2, y: y - odpSize,
      size: odpSize, font: bold, color: hexToRgb("#1A1918"),
    });
    y = y - odpSize - 8;

    // N Scheda
    if (nScheda) {
      const nSchedaSize = Math.round(odpSize * 0.5);
      const maxW = width - margin * 2;
      const lines = wrapText(nScheda, bold, nSchedaSize, maxW);
      for (const line of lines) {
        const lw = bold.widthOfTextAtSize(line, nSchedaSize);
        page.drawText(line, {
          x: (width - lw) / 2, y: y - nSchedaSize,
          size: nSchedaSize, font: bold, color: hexToRgb("#374151"),
        });
        y = y - nSchedaSize - 6;
      }
      y -= 4;
    } else {
      y -= 4;
    }

    // ── Separatore ───────────────────────────────────────────
    page.drawLine({
      start: { x: margin, y }, end: { x: width - margin, y },
      thickness: 1.5, color: hexToRgb("#1A1918"),
    });
    y -= 14;

    // ── Helper: disegna una riga label + valore ──────────────
    function drawRow(label: string, value: string, truncLen = 52) {
      page.drawText(label.toUpperCase(), {
        x: margin, y,
        size: 7, font: bold, color: hexToRgb("#A4A4A6"),
      });
      y -= 20;
      page.drawText(truncate(value, truncLen), {
        x: margin, y,
        size: 16, font: helvetica, color: hexToRgb("#1A1918"),
      });
      y -= 10;
      page.drawLine({
        start: { x: 0, y }, end: { x: width, y },
        thickness: 0.5, color: hexToRgb("#E4E0DA"),
      });
      y -= 12;
    }

    // ── Righe dati ───────────────────────────────────────────
    const clienteDisplay = [clienteInfo, clienteLocalita, clienteInfoExtra].filter(Boolean).join("  |  ");
    if (clienteDisplay) drawRow("Cliente", clienteDisplay, 58);
    if (ritiro.fornitore) drawRow("Fornitore", ritiro.fornitore);
    const desc = ritiro.causale || ritiro.descrizioneMerce || "";
    if (desc) drawRow("Descrizione", desc);
    if (ritiro.note && ritiro.note !== ritiro.causale && ritiro.note !== ritiro.descrizioneMerce) {
      drawRow("Note", ritiro.note, 70);
    }

    // ── QR + foto ────────────────────────────────────────────
    y -= 4;
    const qrImg = await doc.embedPng(qrPng);
    const qrSize = 100;
    const qrX = width - margin - qrSize;

    if (firstPhoto) {
      try {
        let img;
        try { img = await doc.embedJpg(firstPhoto); } catch { img = await doc.embedPng(firstPhoto); }
        const maxPhotoW = qrX - margin - 12;
        const maxPhotoH = Math.max(qrSize, 120);
        const scale = Math.min(maxPhotoW / img.width, maxPhotoH / img.height);
        page.drawImage(img, { x: margin, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
      } catch { /* skip */ }
    }

    page.drawImage(qrImg, { x: qrX, y: y - qrSize, width: qrSize, height: qrSize });
    const apriW = helvetica.widthOfTextAtSize("Apri in Notion", 8);
    page.drawText("Apri in Notion", {
      x: qrX + (qrSize - apriW) / 2, y: y - qrSize - 10,
      size: 8, font: helvetica, color: hexToRgb("#A4A4A6"),
    });

    // ── Footer ───────────────────────────────────────────────
    const footerH = 28;
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: hexToRgb("#F3F4F6") });
    const tipoLabel = isRitiro ? "RITIRO" : "CONSEGNA";
    const idShort = id.replace(/-/g, "").slice(0, 8).toUpperCase();
    page.drawText(`MES MODAR  ·  ${tipoLabel}`, {
      x: margin, y: footerH - 18,
      size: 8.5, font: bold, color: hexToRgb("#A4A4A6"),
    });
    const idStr = `ID ${idShort}`;
    const idW = helvetica.widthOfTextAtSize(idStr, 8.5);
    page.drawText(idStr, {
      x: width - margin - idW, y: footerH - 18,
      size: 8.5, font: helvetica, color: hexToRgb("#A4A4A6"),
    });

    const pdfBytes = await doc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etichetta-${(schedaOdp || id).replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
