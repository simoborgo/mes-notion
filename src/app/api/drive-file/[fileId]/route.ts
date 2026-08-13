import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/googleDriveAuth";

// Proxy generico per file Drive: stream dei byte con Content-Type corretto, usato per
// visualizzazione inline (immagini, PDF) senza dipendere da URL Drive firmati/pubblici — stesso
// spirito del proxy /api/files/[pageId] già esistente per gli allegati ancora su storage Notion.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drive = google.drive({ version: "v3", auth: getAuthClient() as any });
    const meta = await drive.files.get({ fileId, fields: "mimeType, name" });
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    return new NextResponse(Buffer.from(res.data as ArrayBuffer), {
      headers: {
        "Content-Type": meta.data.mimeType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[drive-file]", e);
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }
}
