import type { NextRequest } from "next/server";

// req.nextUrl.origin dipende da Host/X-Forwarded-* come arrivano dal reverse proxy — dietro
// Traefik può risolvere in modo inatteso (es. localhost) invece del dominio pubblico reale.
// APP_PUBLIC_URL, se impostata, ha sempre la precedenza; senza (es. in locale) si ricade
// sull'origin della richiesta come prima.
export function getPublicBaseUrl(req: NextRequest): string {
  return process.env.APP_PUBLIC_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}
