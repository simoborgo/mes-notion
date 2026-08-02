"use client";

import { useState, useMemo, useRef } from "react";
import type { Scheda, Ritiro } from "@/lib/types";
import BadgeStato from "./BadgeStato";

const MAX_BYTES = 10 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtData(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("it-IT");
}

export default function FormScaricoMateriale({ schede, suggerimenti = [] }: { schede: Scheda[]; suggerimenti?: Ritiro[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Scheda | null>(null);
  const [odpLibero, setOdpLibero] = useState<{ id: string; label: string } | null>(null);
  const [descrizione, setDescrizione] = useState("");
  const [foto, setFoto] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  // ODP effettivo per il payload: ricerca normale, oppure precompilato da un suggerimento Ritiri
  const odpEffettivo = selected ? { id: selected.id, label: selected.odp } : odpLibero;

  const filtered = useMemo(() => {
    if (selected) return [];
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return schede
      .filter(s => `${s.odp} ${s.numeroScheda} ${s.commessaNr} ${s.clienteInfo}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [schede, search, selected]);

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const tooBig = files.filter(f => f.size > MAX_BYTES);
    if (tooBig.length) {
      alert(`${tooBig.length} foto troppo grand${tooBig.length > 1 ? "i" : "e"} (max 10 MB ciascuna). Riprova.`);
      return;
    }
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setFoto(prev => [...prev, ...files]);
    setPreviews(prev => [...prev, ...newPreviews]);
  }

  function removeFoto(idx: number) {
    URL.revokeObjectURL(previews[idx]);
    setFoto(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  function applicaSuggerimento(r: Ritiro) {
    setDescrizione(r.descrizioneMerce || r.causale || "");
    setSelected(null);
    setSearch("");
    if (r.numeroOrdineId && r.numeroOrdine) {
      setOdpLibero({ id: r.numeroOrdineId, label: r.numeroOrdine });
    } else {
      setOdpLibero(null);
    }
  }

  function reset() {
    setSearch("");
    setSelected(null);
    setOdpLibero(null);
    setDescrizione("");
    previews.forEach(p => URL.revokeObjectURL(p));
    setFoto([]);
    setPreviews([]);
    if (fileRef.current) fileRef.current.value = "";
    setStatus("idle");
    setErrorMsg("");
    setWarnings([]);
  }

  async function submit() {
    if (!descrizione.trim() || foto.length === 0 || status === "loading") return;
    setStatus("loading");
    setErrorMsg("");
    setWarnings([]);
    try {
      const foto_base64 = await Promise.all(foto.map(toBase64));
      const res = await fetch("/api/scarico-materiale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odp_page_id: odpEffettivo?.id ?? null,
          odp_label: odpEffettivo?.label ?? null,
          descrizione: descrizione.trim(),
          foto_base64,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; warnings?: string[] };
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? `Errore ${res.status}`);
      if (data.warnings?.length) setWarnings(data.warnings);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Errore di rete — riprova");
    }
  }

  const canSubmit = !!descrizione.trim() && foto.length > 0 && status !== "loading";

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex items-center justify-center rounded-full" style={{ width: 96, height: 96, background: "#D1FAE5" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#065F46" }}>Notifica inviata</p>
            <p className="text-base mt-2" style={{ color: "var(--color-black)" }}>La produzione è stata avvisata</p>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg px-4 py-3 text-left space-y-1" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
              <p className="text-xs font-semibold" style={{ color: "#92400E" }}>⚠</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-xs" style={{ color: "#92400E" }}>{w}</p>
              ))}
            </div>
          )}
          <button
            onClick={reset}
            className="w-full py-4 rounded-xl text-base font-semibold transition-opacity hover:opacity-90 active:opacity-75"
            style={{ background: "var(--color-primary)", color: "white" }}
          >
            + Nuovo invio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Suggerimenti da Ritiri e Consegne */}
      {suggerimenti.length > 0 && (
        <section>
          <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
            Ritiri recenti — precompila
          </label>
          <div className="flex flex-wrap gap-2">
            {suggerimenti.map(r => (
              <button
                key={r.id}
                onClick={() => applicaSuggerimento(r)}
                className="text-left px-3 py-2 rounded-lg border text-xs hover:bg-orange-50"
                style={{ borderColor: "#e5e4e0" }}
              >
                <span className="font-semibold block" style={{ color: "var(--color-black)" }}>
                  {r.numeroOrdine || r.descrizioneMerce || "Ritiro"}
                </span>
                <span style={{ color: "var(--color-grey-mid)" }}>
                  {[r.fornitore, fmtData(r.dataFatto || r.dataTrasporto)].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ODP opzionale */}
      <section>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
          ODP <span className="font-normal text-xs" style={{ color: "var(--color-grey-mid)" }}>opzionale — lascia vuoto per materiale libero</span>
        </label>

        {odpEffettivo ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2"
            style={{ borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xl" style={{ color: "var(--color-black)" }}>{odpEffettivo.label}</p>
              {selected?.clienteInfo && (
                <p className="text-sm truncate" style={{ color: "var(--color-grey-mid)" }}>{selected.clienteInfo}</p>
              )}
            </div>
            {selected && <BadgeStato stato={selected.statoProduzione} />}
            <button
              onClick={() => { setSelected(null); setOdpLibero(null); setSearch(""); }}
              aria-label="Deseleziona ODP"
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{ width: 44, height: 44, background: "#F3F4F6", color: "#6B7280" }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              className="w-full rounded-xl border px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
              style={{ borderColor: "#d1d5db", height: 52 }}
              placeholder="Cerca ODP, commessa, cliente… (facoltativo)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {filtered.length > 0 && (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0", maxHeight: 280, overflowY: "auto" }}>
                {filtered.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelected(s); setSearch(""); }}
                    className="w-full flex items-center gap-3 px-4 border-b last:border-0 text-left"
                    style={{ borderColor: "#e5e4e0", minHeight: 60 }}
                  >
                    <div className="flex-1 min-w-0 py-2">
                      <p className="font-semibold" style={{ color: "var(--color-black)" }}>{s.odp}</p>
                      {(s.commessaNr || s.clienteInfo) && (
                        <p className="text-xs truncate" style={{ color: "var(--color-grey-mid)" }}>
                          {[s.commessaNr, s.clienteInfo].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <BadgeStato stato={s.statoProduzione} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Descrizione */}
      <section>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
          Descrizione <span style={{ color: "#EF4444" }}>*</span>
        </label>
        <textarea
          className="w-full rounded-xl border px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          style={{ borderColor: "#d1d5db", minHeight: 90 }}
          placeholder="Cosa stai portando in produzione…"
          value={descrizione}
          onChange={e => setDescrizione(e.target.value)}
        />
      </section>

      {/* Foto */}
      <section>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
          Foto <span style={{ color: "#EF4444" }}>*</span>
          {foto.length > 0 && (
            <span className="ml-2 font-normal text-xs" style={{ color: "var(--color-grey-mid)" }}>
              {foto.length} allegat{foto.length > 1 ? "e" : "a"}
            </span>
          )}
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFoto}
        />
        {previews.length > 0 ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {previews.map((src, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden border" style={{ borderColor: "#e5e4e0", aspectRatio: "1/1" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeFoto(i)}
                  aria-label={`Rimuovi foto ${i + 1}`}
                  className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full"
                  style={{ width: 28, height: 28, background: "rgba(0,0,0,0.55)", color: "white", fontSize: "0.75rem" }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed gap-1"
              style={{ borderColor: "#d1d5db", aspectRatio: "1/1", minHeight: 80 }}
            >
              <span style={{ fontSize: "1.5rem", color: "var(--color-grey-icon)" }}>+</span>
              <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Aggiungi</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed"
            style={{ borderColor: "#d1d5db", minHeight: 140 }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-grey-icon)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className="text-base font-medium" style={{ color: "var(--color-grey-mid)" }}>
              Tocca per scattare una foto
            </span>
          </button>
        )}
      </section>

      {errorMsg && (
        <div className="rounded-lg px-4 py-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <p className="text-sm font-medium" style={{ color: "#991B1B" }}>{errorMsg}</p>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full py-4 rounded-xl text-base font-bold text-white disabled:opacity-60 transition-opacity"
        style={{ background: "var(--color-primary)" }}
      >
        {status === "loading" ? "Invio…" : "Invia notifica"}
      </button>
    </div>
  );
}
