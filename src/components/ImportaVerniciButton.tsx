"use client";

import { useState } from "react";
import ImportaVerniciModal from "./ImportaVerniciModal";

export default function ImportaVerniciButton() {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAperto(true)}
        className="text-sm px-4 py-2 rounded-lg font-medium whitespace-nowrap border transition-colors hover:opacity-90"
        style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
      >
        Importa da OS1
      </button>
      {aperto && <ImportaVerniciModal onClose={() => setAperto(false)} />}
    </>
  );
}
