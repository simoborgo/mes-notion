"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";

const STATI_CARICO = ["In lavorazione", "Materiale Pronto"];
const DESTINAZIONI = ["Magazzino interno", "Fornitore esterno"] as const;
type Destinazione = (typeof DESTINAZIONI)[number];
const MAX_BYTES = 10 * 1024 * 1024;

const DEST_INFO: Record<Destinazione, string> = {
  "Magazzino interno": "Cambierà stato in Materiale Pronto",
  "Fornitore esterno": "Cambierà stato in In lavorazione esterna",
};

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


export default function FormCaricoMagazzino({ schede, sottoschede = [], fornitori = [] }: { schede: Scheda[]; sottoschede?: Scheda[]; fornitori?: string[] }) {
  const router = useRouter();
  const odpList = useMemo(
    () => schede.filter(s => STATI_CARICO.includes(s.statoProduzione)),
    [schede]
  );

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Scheda | null>(null);
  const [selectedFiglia, setSelectedFiglia] = useState<Scheda | null>(null);
  const [foto, setFoto] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dest, setDest] = useState<Destinazione>("Magazzino interno");
  const [note, setNote] = useState("");
  const [nonConformita, setNonConformita] = useState(false);
  const [aggiornaFiglie, setAggiornaFiglie] = useState(false);
  const creaRitiro = dest === "Fornitore esterno";
  const [ritiroData, setRitiroData] = useState(() => new Date().toISOString().slice(0, 10));
  const [ritiroFornitore, setRitiroFornitore] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastSubmit, setLastSubmit] = useState<{ odp: string; dest: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const figlie = useMemo(
    () => selected ? sottoschede.filter(s => s.parentId === selected.id) : [],
    [selected, sottoschede]
  );

  // Auto-fill fornitore: sottoscheda ha priorità sul padre
  useEffect(() => {
    const scheda = selectedFiglia ?? selected;
    if (scheda?.fornitore) setRitiroFornitore(scheda.fornitore);
  }, [selected, selectedFiglia]);

  // L'ODP effettivo per il payload: sottoscheda selezionata, altrimenti il padre
  const odpEffettivo = selectedFiglia ?? selected;

  const filtered = useMemo(() => {
    if (selected) return [];
    const q = search.toLowerCase().trim();
    if (!q) return odpList.slice(0, 8);
    return odpList
      .filter(s =>
        `${s.odp} ${s.numeroScheda} ${s.commessaNr} ${s.clienteInfo} ${s.codiceArticolo}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20);
  }, [odpList, search, selected]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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

  function reset() {
    setSearch("");
    setSelected(null);
    setSelectedFiglia(null);
    previews.forEach(p => URL.revokeObjectURL(p));
    setFoto([]);
    setPreviews([]);
    if (fileRef.current) fileRef.current.value = "";
    setDest("Magazzino interno");
    setNote("");
    setNonConformita(false);
    setAggiornaFiglie(false);
    setRitiroData(new Date().toISOString().slice(0, 10));
    setRitiroFornitore("");
    setStatus("idle");
    setErrorMsg("");
  }

  async function submit() {
    if (!odpEffettivo || foto.length === 0 || status === "loading") return;
    setStatus("loading");
    setErrorMsg("");
    setWarnings([]);
    try {
      const foto_base64 = await Promise.all(foto.map(toBase64));
      const res = await fetch("/api/carico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odp_page_id: odpEffettivo.id,
          odp_label: odpEffettivo.odp,
          commessa_nr: odpEffettivo.commessaNr,
          cliente_info: odpEffettivo.clienteInfo,
          odp_commessa_id: odpEffettivo.commessaId,
          foto_base64,
          destinazione: dest,
          non_conformita: dest === "Fornitore esterno" && nonConformita,
          figlie_page_ids: dest === "Magazzino interno" && aggiornaFiglie ? figlie.map(f => f.id) : [],
          note: note.trim(),
          timestamp: new Date().toISOString(),
          crea_ritiro: dest === "Fornitore esterno" && creaRitiro,
          ritiro_data: ritiroData,
          ritiro_fornitore: ritiroFornitore.trim(),
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; warnings?: string[] };
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? `Errore ${res.status}`);
      if (data.warnings?.length) setWarnings(data.warnings);
      setLastSubmit({ odp: odpEffettivo.odp, dest });
      setStatus("success");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Errore di rete — riprova");
    }
  }

  const canSubmit = !!odpEffettivo && foto.length > 0 && status !== "loading";

  // ── Schermata di conferma ──────────────────────────────────
  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 96, height: 96, background: "#D1FAE5" }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#065F46" }}>Carico registrato</p>
            <p className="text-base mt-2" style={{ color: "var(--color-black)" }}>
              ODP <strong>{lastSubmit?.odp}</strong> → {lastSubmit?.dest}
            </p>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg px-4 py-3 text-left space-y-1" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
              <p className="text-xs font-semibold" style={{ color: "#92400E" }}>⚠ Stato aggiornato su Notion, ma:</p>
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
            + Nuovo inserimento
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────
  return (
    <div className="space-y-7">

      {/* ODP */}
      <section>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
          ODP <span style={{ color: "#EF4444" }}>*</span>
          <span className="ml-2 font-normal text-xs" style={{ color: "var(--color-grey-mid)" }}>
            {odpList.length} disponibili
          </span>
        </label>

        {selected ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2"
            style={{ borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xl" style={{ color: "var(--color-black)" }}>{selected.odp}</p>
              {selected.numeroScheda && (
                <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
                  {selected.numeroScheda}
                </p>
              )}
              {selected.clienteInfo && (
                <p className="text-sm truncate" style={{ color: "var(--color-grey-mid)" }}>
                  {selected.clienteInfo}
                </p>
              )}
            </div>
            <BadgeStato stato={selected.statoProduzione} />
            <button
              onClick={() => { setSelected(null); setSearch(""); }}
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
              placeholder="Cerca ODP, commessa, cliente…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0", maxHeight: 320, overflowY: "auto" }}>
              {filtered.length === 0 && !search && (
                <div className="py-6 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Inizia a digitare per cercare tra {odpList.length} ODP
                </div>
              )}
              {filtered.length === 0 && search && (
                <div className="py-6 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun ODP trovato per &quot;{search}&quot;
                </div>
              )}
              {filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelected(s); setSearch(""); }}
                  className="w-full flex items-center gap-3 px-4 border-b last:border-0 text-left"
                  style={{ borderColor: "#e5e4e0", minHeight: 68 }}
                >
                  <div className="flex-1 min-w-0 py-2">
                    <p className="font-semibold" style={{ color: "var(--color-black)" }}>{s.odp}</p>
                    {s.numeroScheda && (
                      <p className="text-xs font-medium" style={{ color: "var(--color-black)" }}>
                        {s.numeroScheda}
                      </p>
                    )}
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
          </div>
        )}
      </section>

      {/* Sottoschede — visibile solo se l'ODP selezionato ha figli */}
      {selected && figlie.length > 0 && (
        <section className="space-y-2">
          <label className="block text-sm font-semibold" style={{ color: "var(--color-black)" }}>
            Sottoscheda
            <span className="ml-2 font-normal text-xs" style={{ color: "var(--color-grey-mid)" }}>
              {figlie.length} disponibili — opzionale
            </span>
          </label>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
            {/* Opzione: usa ODP principale */}
            <button
              onClick={() => setSelectedFiglia(null)}
              className="w-full flex items-center gap-3 px-4 border-b text-left transition-colors"
              style={{
                borderColor: "#e5e4e0",
                minHeight: 56,
                background: !selectedFiglia ? "rgba(240,143,37,0.06)" : "white",
              }}
            >
              <span
                className="flex-shrink-0 rounded-full border-2 flex items-center justify-center"
                style={{
                  width: 20, height: 20,
                  borderColor: !selectedFiglia ? "var(--color-primary)" : "#d1d5db",
                  background: !selectedFiglia ? "var(--color-primary)" : "white",
                }}
              >
                {!selectedFiglia && <span className="block rounded-full bg-white" style={{ width: 8, height: 8 }} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>
                  ODP principale — {selected.odp}
                </p>
                {selected.numeroScheda && (
                  <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{selected.numeroScheda}</p>
                )}
              </div>
              <BadgeStato stato={selected.statoProduzione} />
            </button>
            {/* Sottoschede */}
            {figlie.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFiglia(f)}
                className="w-full flex items-center gap-3 px-4 border-b last:border-0 text-left transition-colors"
                style={{
                  borderColor: "#e5e4e0",
                  minHeight: 60,
                  background: selectedFiglia?.id === f.id ? "rgba(240,143,37,0.06)" : "white",
                }}
              >
                <span
                  className="flex-shrink-0 rounded-full border-2 flex items-center justify-center"
                  style={{
                    width: 20, height: 20,
                    borderColor: selectedFiglia?.id === f.id ? "var(--color-primary)" : "#d1d5db",
                    background: selectedFiglia?.id === f.id ? "var(--color-primary)" : "white",
                  }}
                >
                  {selectedFiglia?.id === f.id && <span className="block rounded-full bg-white" style={{ width: 8, height: 8 }} />}
                </span>
                <div className="flex-1 min-w-0 py-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>
                    {f.odp || "—"}
                  </p>
                  {f.numeroScheda && (
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{f.numeroScheda}</p>
                  )}
                </div>
                <BadgeStato stato={f.statoProduzione} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Aggiorna sottoschede — solo Magazzino interno con figlie */}
      {selected && figlie.length > 0 && dest === "Magazzino interno" && (
        <button
          onClick={() => setAggiornaFiglie(v => !v)}
          className="w-full flex items-center gap-4 px-4 rounded-xl border-2 text-left transition-colors"
          style={{
            minHeight: 64,
            borderColor: aggiornaFiglie ? "var(--color-primary)" : "#e5e4e0",
            background: aggiornaFiglie ? "rgba(240,143,37,0.06)" : "white",
          }}
        >
          <span
            className="flex-shrink-0 flex items-center justify-center rounded border-2 transition-colors"
            style={{
              width: 22, height: 22,
              borderColor: aggiornaFiglie ? "var(--color-primary)" : "#d1d5db",
              background: aggiornaFiglie ? "var(--color-primary)" : "white",
            }}
          >
            {aggiornaFiglie && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>
              Aggiorna anche le {figlie.length} sottoschede
            </p>
            <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
              Cambierà stato in Materiale Pronto per tutte le sottoschede
            </p>
          </div>
        </button>
      )}

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
          <div className="space-y-3">
            {/* Griglia thumbnail */}
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

              {/* Bottone aggiungi */}
              <button
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed gap-1"
                style={{ borderColor: "#d1d5db", aspectRatio: "1/1", minHeight: 80 }}
              >
                <span style={{ fontSize: "1.5rem", color: "var(--color-grey-icon)" }}>+</span>
                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Aggiungi</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed"
            style={{ borderColor: "#d1d5db", minHeight: 140 }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-grey-icon)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span className="text-base font-medium" style={{ color: "var(--color-grey-mid)" }}>
              Tocca per scattare una foto
            </span>
          </button>
        )}
      </section>

      {/* Destinazione */}
      <section>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
          Destinazione
        </label>
        <div className="grid grid-cols-2 gap-3">
          {DESTINAZIONI.map(d => (
            <button
              key={d}
              onClick={() => setDest(d)}
              className="rounded-xl border-2 font-semibold"
              style={{
                minHeight: 64,
                fontSize: "0.95rem",
                borderColor: dest === d ? "var(--color-primary)" : "#e5e4e0",
                background: dest === d ? "rgba(240,143,37,0.08)" : "white",
                color: dest === d ? "var(--color-primary)" : "var(--color-grey-mid)",
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      {/* Info label stato */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
        style={{ background: "#faf9f7", border: "1px solid #e5e4e0", color: "var(--color-grey-mid)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          Al salvataggio: <strong style={{ color: "var(--color-black)" }}>{DEST_INFO[dest]}</strong>
        </span>
      </div>

      {/* Non Conformità — solo per Fornitore esterno */}
      {dest === "Fornitore esterno" && (
        <button
          onClick={() => setNonConformita(v => !v)}
          className="w-full flex items-center gap-4 px-4 rounded-xl border-2 text-left transition-colors"
          style={{
            minHeight: 64,
            borderColor: nonConformita ? "#EF4444" : "#e5e4e0",
            background: nonConformita ? "#FEF2F2" : "white",
          }}
        >
          {/* Checkbox */}
          <span
            className="flex-shrink-0 flex items-center justify-center rounded border-2 transition-colors"
            style={{
              width: 22, height: 22,
              borderColor: nonConformita ? "#EF4444" : "#d1d5db",
              background: nonConformita ? "#EF4444" : "white",
            }}
          >
            {nonConformita && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: nonConformita ? "#991B1B" : "var(--color-black)" }}>
              Non Conformità
            </p>
            <p className="text-xs" style={{ color: nonConformita ? "#EF4444" : "var(--color-grey-mid)" }}>
              Il materiale viene inviato per un problema di qualità
            </p>
          </div>
        </button>
      )}

      {/* Sezione Ritiri — sempre attiva per Fornitore esterno */}
      {dest === "Fornitore esterno" && (
        <section>
          <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: "var(--color-primary)" }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: "rgba(240,143,37,0.06)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>
                  Riga Ritiri e Consegne — creata automaticamente
                </p>
                <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                  Verrà aggiunta una consegna in uscita con stato Da Fare
                </p>
              </div>
            </div>
            <div className="px-4 pb-4 pt-3 space-y-4 border-t" style={{ borderColor: "#e5e4e0" }}>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-grey-mid)" }}>
                  Fornitore
                </label>
                <select
                  className="w-full rounded-xl border px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  style={{ borderColor: "#d1d5db", height: 48 }}
                  value={ritiroFornitore}
                  onChange={e => setRitiroFornitore(e.target.value)}
                >
                  <option value="">— nessuno —</option>
                  {fornitori.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-grey-mid)" }}>
                  Data Trasporto
                </label>
                <input
                  type="date"
                  className="w-full rounded-xl border px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  style={{ borderColor: "#d1d5db", height: 48 }}
                  value={ritiroData}
                  onChange={e => setRitiroData(e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Descrizione */}
      <section>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--color-black)" }}>
          Descrizione
          <span className="ml-2 font-normal text-xs" style={{ color: "var(--color-grey-mid)" }}>(opzionale)</span>
        </label>
        <textarea
          className="w-full rounded-xl border px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
          style={{ borderColor: "#d1d5db" }}
          rows={3}
          placeholder="Informazioni aggiuntive…"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </section>

      {/* Errore */}
      {status === "error" && (
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#FEE2E2" }}>
          <span className="text-xl flex-shrink-0" style={{ color: "#991B1B" }}>⚠</span>
          <div>
            <p className="font-semibold" style={{ color: "#991B1B" }}>Invio fallito</p>
            <p className="text-sm mt-0.5" style={{ color: "#991B1B" }}>{errorMsg}</p>
            <button
              onClick={() => setStatus("idle")}
              className="text-sm underline mt-2"
              style={{ color: "#7F1D1D" }}
            >
              Riprova
            </button>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-xl font-bold text-lg flex items-center justify-center gap-3"
        style={{
          minHeight: 64,
          background: canSubmit ? "var(--color-primary)" : "#e5e4e0",
          color: canSubmit ? "white" : "#9CA3AF",
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {status === "loading" ? (
          <>
            <div
              className="rounded-full border-2 border-white border-t-transparent animate-spin"
              style={{ width: 22, height: 22 }}
            />
            Invio in corso…
          </>
        ) : (
          "Registra carico"
        )}
      </button>
    </div>
  );
}
