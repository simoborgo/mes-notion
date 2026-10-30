"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventoStorico, CategoriaStorico } from "@/lib/types";
import { CATEGORIE_STORICO } from "@/lib/types";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

function quando(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

function leggiBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Lettura file non riuscita"));
    r.readAsDataURL(file);
  });
}

export default function CommessaStorico({ commessaId, eventi, canEdit }: { commessaId: string; eventi: EventoStorico[]; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filtro, setFiltro] = useState<CategoriaStorico | "">("");
  const [testo, setTesto] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  async function aggiungi() {
    if (!testo.trim()) { setErrore("Scrivi il testo della nota"); return; }
    setBusy(true); setErrore("");
    try {
      const res = await fetch(`/api/commesse/${commessaId}/note`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testo }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Errore nel salvataggio");
      const nota = await res.json();
      for (const f of files) {
        const up = await fetch(`/api/commesse/${commessaId}/allegati`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: await leggiBase64(f), filename: f.name, categoria: "Altro", notaId: nota.id }),
        });
        if (!up.ok) throw new Error(`Nota salvata, ma "${f.name}" non è stato caricato`);
      }
      setTesto(""); setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel salvataggio");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function elimina(notaId: string) {
    if (!window.confirm("Eliminare la nota e i suoi file?")) return;
    const res = await fetch(`/api/commesse/${commessaId}/note/${notaId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setErrore("Errore nell'eliminazione");
  }

  const visibili = eventi.filter((e) => !filtro || e.categoria === filtro);

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
          <textarea className={`${inputCls} w-full`} rows={2} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Aggiungi una nota. Es. il cliente ha chiesto di anticipare la consegna dei bagni camera." aria-label="Nota" />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={aggiungi} disabled={busy} className="text-sm font-semibold rounded px-3 py-1.5 disabled:opacity-50" style={{ background: "var(--color-primary)", color: "var(--color-black)" }}>
              {busy ? "Salvo…" : "Aggiungi nota"}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <button type="button" className="text-xs underline" style={{ color: "var(--color-primary)" }} onClick={() => fileRef.current?.click()}>
              {files.length ? `${files.length} file allegati` : "+ Allega file"}
            </button>
            {errore && <span className="text-xs" style={{ color: "#991B1B" }}>{errore}</span>}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {(["", ...CATEGORIE_STORICO] as const).map((c) => (
          <button
            key={c || "tutto"}
            type="button"
            onClick={() => setFiltro(c)}
            className="text-xs rounded-full border px-3 py-1"
            style={filtro === c ? { background: "var(--color-black)", color: "#fff", borderColor: "var(--color-black)" } : { background: "#fff", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}
          >
            {c || "Tutto"}
          </button>
        ))}
      </div>

      {visibili.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun evento.</div>
      ) : (
        <ul className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {visibili.map((e) => (
            <li key={e.id} className="flex gap-3 p-4 flex-wrap sm:flex-nowrap">
              <span className="text-xs tabular-nums w-32 shrink-0 pt-0.5" style={{ color: "var(--color-grey-mid)" }}>{quando(e.quando)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-line">
                  <span className="text-xs font-semibold rounded-full px-2 py-0.5 mr-2" style={e.categoria === "Note" ? { background: "#FDEBD6", color: "#C06A10" } : { background: "#EFEBE5", color: "var(--color-grey-mid)" }}>{e.categoria}</span>
                  {e.testo}
                  {e.autore && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}> · {e.autore}</span>}
                </p>
                {(e.allegati?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {e.allegati!.map((a) => (
                      <a key={a.id} href={`/api/drive-file/${a.driveFileId}`} target="_blank" rel="noreferrer" className="text-xs rounded border px-2 py-0.5 underline" style={{ borderColor: "#E4E0DA", background: "#F5F2EE" }}>{a.nomeFile}</a>
                    ))}
                  </div>
                )}
                {canEdit && e.notaId && (
                  <button type="button" className="text-xs underline mt-1.5" style={{ color: "#991B1B" }} onClick={() => elimina(e.notaId!)}>Elimina nota</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
