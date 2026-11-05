"use client";

import { useState } from "react";

// Logo del brand (solo documenti interni). Se il brand non ha logo o l'immagine non si carica
// non mostra nulla, così la testata resta com'era.
export default function BrandLogo({ brandId, altezza = 44, className }: { brandId: string | null | undefined; altezza?: number; className?: string }) {
  const [errore, setErrore] = useState(false);
  if (!brandId || errore) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/admin/brand/${brandId}/logo`}
      alt=""
      onError={() => setErrore(true)}
      className={className}
      style={{ height: altezza, maxWidth: altezza * 3, width: "auto", objectFit: "contain" }}
    />
  );
}
