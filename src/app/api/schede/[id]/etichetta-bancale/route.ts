import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSchedaById } from "@/lib/schedeRepository";
import { getOrCreateQrCodice } from "@/lib/schedaQrRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";
import { getLogoDataUriByCommessa } from "@/lib/brandRepository";
import { buildEtichetteBancaleHtml, htmlToPdfA4 } from "@/lib/pdf/stampaMagazzinoA4";

const MAX_BANCALI = 20;

// Etichette A4 per identificare i bancali di una scheda: ?tot=3 stampa "1/3", "2/3", "3/3" in un
// solo PDF; ?contenuto= è un testo libero stampato su ogni etichetta. Non salva nulla.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const totale = Math.floor(Number(sp.get("tot") ?? "1"));
    if (!Number.isFinite(totale) || totale < 1 || totale > MAX_BANCALI) {
      return NextResponse.json({ error: `Numero di bancali non valido (1-${MAX_BANCALI})` }, { status: 400 });
    }
    const contenuto = (sp.get("contenuto") ?? "").trim().slice(0, 200);

    const { id } = await params;
    const scheda = await getSchedaById(id);
    const codice = await getOrCreateQrCodice(scheda.id);
    // Logo del brand della commessa: se manca (o la lettura fallisce) la stampa esce senza
    const brandLogo = scheda.commessaId ? await getLogoDataUriByCommessa(scheda.commessaId).catch(() => null) : null;
    const qrSvg = await QRCode.toString(`${getPublicBaseUrl(req)}/q/${codice}`, {
      type: "svg", width: 120, margin: 1, color: { dark: "#1A1918", light: "#ffffff" },
    });

    const pdf = await htmlToPdfA4(buildEtichetteBancaleHtml({
      scheda, clienteInfo: scheda.clienteInfo || "", totale, contenuto, qrSvg, brandLogo,
    }));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bancali-${(scheda.odp || scheda.id).replace(/[^\w.-]/g, "-")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[schede/etichetta-bancale]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
