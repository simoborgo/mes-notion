import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSchedaById, getSchedeFiglie } from "@/lib/schedeRepository";
import { getOrCreateQrCodice } from "@/lib/schedaQrRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";
import { getLogoDataUriByCommessa } from "@/lib/brandRepository";
import { calcolaCompletezza } from "@/lib/completezzaSottoschede";
import { buildFoglioProduzioneHtml, htmlToPdfA4 } from "@/lib/pdf/stampaMagazzinoA4";

// Foglio A4 per la produzione: stato del set di sottoschede di un arredo (in sede / presso
// fornitore). Stessa grafica dell'etichetta Ritiri e Consegne. Solo lettura.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const scheda = await getSchedaById(id);
    const figlie = await getSchedeFiglie(scheda.id);
    const codice = await getOrCreateQrCodice(scheda.id);
    // Logo del brand della commessa: se manca (o la lettura fallisce) la stampa esce senza
    const brandLogo = scheda.commessaId ? await getLogoDataUriByCommessa(scheda.commessaId).catch(() => null) : null;
    const qrSvg = await QRCode.toString(`${getPublicBaseUrl(req)}/q/${codice}`, {
      type: "svg", width: 120, margin: 1, color: { dark: "#1A1918", light: "#ffffff" },
    });

    const html = buildFoglioProduzioneHtml({
      scheda, figlie, completezza: calcolaCompletezza(figlie), qrSvg, clienteInfo: scheda.clienteInfo || "", brandLogo,
    });
    const pdf = await htmlToPdfA4(html);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="produzione-${(scheda.odp || scheda.id).replace(/[^\w.-]/g, "-")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[schede/foglio-produzione]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
