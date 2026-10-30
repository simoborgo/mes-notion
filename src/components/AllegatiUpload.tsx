"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoriaAllegato } from "@/lib/types";

function leggiBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Lettura file non riuscita"));
    r.readAsDataURL(file);
  });
}

// Bottone di caricamento condiviso da tab Documenti e voci di Specifiche.
export default function AllegatiUpload({ commessaId, specificaId, categoria, label = "+ Carica file" }: {
  commessaId: string; specificaId?: string; categoria: CategoriaAllegato; label?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  async function carica(file: File) {
    setBusy(true); setErrore("");
    try {
      const res = await fetch(`/api/commesse/${commessaId}/allegati`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: await leggiBase64(file), filename: file.name, categoria, specificaId: specificaId ?? null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Errore nel caricamento");
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel caricamento");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={ref} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) carica(f); }} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
        {busy ? "Carico…" : label}
      </button>
      {errore && <span className="text-xs" style={{ color: "#991B1B" }}>{errore}</span>}
    </span>
  );
}
