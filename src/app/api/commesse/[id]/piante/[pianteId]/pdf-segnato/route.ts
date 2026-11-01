import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getPiantaById, salvaPdfSegnato } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, PIANTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; pianteId: string }> };

const nomePdf = (etichetta: string, nomeFile: string) =>
  `${(etichetta || nomeFile.replace(/\.[^.]+$/, "")).replace(/[\\/:*?"<>|]/g, "_")} - segnata.pdf`;

// PDF segnato in streaming, aperto nel browser. L'id Drive cambia a ogni rigenerazione e il client
// lo aggiunge come ?v=, quindi può restare in cache.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id || !p.pdfSegnatoDriveId) return NextResponse.json({ error: "PDF segnato non disponibile" }, { status: 404 });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drive = google.drive({ version: "v3", auth: getAuthClient() as any });
    const res = await drive.files.get({ fileId: p.pdfSegnatoDriveId, alt: "media" }, { responseType: "stream" });
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nomePdf(p.etichetta, p.nomeFile))}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    };
    if (res.headers["content-length"]) headers["Content-Length"] = String(res.headers["content-length"]);
    return new NextResponse(Readable.toWeb(res.data as Readable) as ReadableStream, { headers });
  } catch (e) {
    console.error("[piante/pdf-segnato]", e);
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }
}

// Il browser genera il PDF (stesso disegno dello schermo) e lo carica qui; body = PDF grezzo.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !PIANTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 100 || buf.subarray(0, 5).toString("latin1") !== "%PDF-" || buf.length > 80_000_000) {
    return NextResponse.json({ error: "PDF non valido" }, { status: 400 });
  }
  try {
    const aggiornata = await salvaPdfSegnato(pianteId, buf, nomePdf(p.etichetta, p.nomeFile));
    void logOperation(session.name, "UPDATE", "commessa_pianta", pianteId, { commessaId: id, pdfSegnato: true });
    return NextResponse.json(aggiornata);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore salvataggio PDF segnato" }, { status: 500 });
  }
}
