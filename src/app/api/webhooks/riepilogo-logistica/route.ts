import { NextRequest, NextResponse } from "next/server";
import { getRiepilogoLogistica, emailRiepilogo } from "@/lib/riepilogoLogisticaRepository";
import { getPublicBaseUrl } from "@/lib/url";
import { logOperation } from "@/lib/audit";

// Riepilogo del mattino per la Logistica, chiamato da uno Schedule Trigger n8n (lun–ven 06:45, vedi
// scripts/n8n/riepilogo-logistica-mattino.json). Stesso schema del ricalcolo APS: secret nell'header
// x-webhook-secret. Restituisce oggetto e corpo HTML dell'email: l'invio lo fa il nodo Email di n8n,
// subito dopo questa chiamata.
export async function POST(req: NextRequest) {
  const secret = process.env.RIEPILOGO_LOGISTICA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const riepilogo = await getRiepilogoLogistica();
    const { oggetto, html } = emailRiepilogo(riepilogo, getPublicBaseUrl(req));
    const conteggi = {
      oggi: riepilogo.oggi.length,
      in_ritardo: riepilogo.ritardo.totale,
      giri_in_ritardo: riepilogo.giriInRitardo.totale,
      rilavorazioni_senza_ritiro: riepilogo.rilavorazioniSenzaRitiro.length,
    };
    void logOperation("Sistema", "CREATE", "riepilogo_logistica", riepilogo.data, { via: "cron-auto", ...conteggi });
    return NextResponse.json({ ok: true, data: riepilogo.data, ...conteggi, oggetto, html });
  } catch (e) {
    console.error("[webhooks/riepilogo-logistica]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
