import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getPiantaById } from "@/lib/commessePianteRepository";

// File della pianta in streaming, con una sola chiamata a Drive (tipo e id vengono dal database).
// L'id Drive cambia a ogni sostituzione e il client lo aggiunge come ?v=, quindi il file può
// restare in cache del browser a lungo. Il tempo di Drive finisce in Server-Timing.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; pianteId: string }> }) {
  const { id, pianteId } = await params;
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });

  try {
    const t0 = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drive = google.drive({ version: "v3", auth: getAuthClient() as any });
    const res = await drive.files.get({ fileId: p.driveFileId, alt: "media" }, { responseType: "stream" });
    const attesaDrive = Date.now() - t0;
    console.log(`[piante/file] ${pianteId} Drive first byte ${attesaDrive}ms`);
    const headers: Record<string, string> = {
      "Content-Type": p.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Server-Timing": `drive;dur=${attesaDrive}`,
    };
    const lunghezza = res.headers["content-length"];
    if (lunghezza) headers["Content-Length"] = String(lunghezza);
    return new NextResponse(Readable.toWeb(res.data as Readable) as ReadableStream, { headers });
  } catch (e) {
    console.error("[piante/file]", e);
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }
}
