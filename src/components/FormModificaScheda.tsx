"use client";

import { useEffect, useRef, useState } from "react";
import type { Scheda, SchedaUpdate, Area, Commessa } from "@/lib/types";
import FormArea from "./FormArea";

const STATI = [
  "Da Iniziare",
  "In lavorazione",
  "In lavorazione Esterna",
  "Materiale Pronto",
  "Verificato",
  "Completato",
  "In Attesa Rilavorazione",
  "In attesa materiale",
  "Produzione Bloccata",
  "Annullata",
  "Revisione UTT",
];

interface Props {
  scheda: Scheda;
  onClose: () => void;
  onSave: (updated: Scheda) => void;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressPhoto(file: File, maxDim = 1400, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

function AllegatoSection({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--color-grey-mid)" }}>{titolo}</p>
      {children}
    </div>
  );
}

export default function FormModificaScheda({ scheda, onClose, onSave }: Props) {
  const [schedaLive, setSchedaLive] = useState(scheda);
  const [form, setForm] = useState<SchedaUpdate>({
    odp: scheda.odp,
    numeroScheda: scheda.numeroScheda,
    commessaId: scheda.commessaId,
    statoProduzione: scheda.statoProduzione,
    dataProduzionePrevista: scheda.dataProduzionePrevista ?? "",
    note: scheda.note,
    codiceArticolo: scheda.codiceArticolo,
    posizione: scheda.posizione,
    quantita: scheda.quantita,
    noteStato: scheda.noteStato,
    areaId: scheda.areaId,
    priorita: scheda.priorita,
  });
  const [initialForm] = useState(form);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [commesse, setCommesse] = useState<Commessa[]>([]);
  useEffect(() => {
    fetch(`/api/commesse`).then(r => r.json()).then((data) => setCommesse(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const [aree, setAree] = useState<Area[]>([]);
  const [showFormArea, setShowFormArea] = useState(false);
  useEffect(() => {
    if (!form.commessaId) return;
    fetch(`/api/aree?commessaId=${form.commessaId}`).then(r => r.json()).then((data) => setAree(Array.isArray(data) ? data : [])).catch(() => {});
  }, [form.commessaId]);

  function handleCommessaChange(id: string) {
    // Un'Area appartiene a una singola Commessa: cambiando commessa quella già selezionata
    // non ha più senso, si riparte da "nessuna" e si ricarica la lista sopra (o si svuota qui
    // se la nuova commessa è vuota — l'effect sopra non chiama fetch in quel caso).
    set("commessaId", id || null);
    set("areaId", null);
    setAree([]);
  }

  function handleAreaCreata(area: Area) {
    setAree((prev) => [...prev, area]);
    set("areaId", area.id);
    setShowFormArea(false);
  }

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCopertina, setUploadingCopertina] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const copertinaInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof SchedaUpdate>(k: K, v: SchedaUpdate[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleClose() {
    if (isDirty && !confirm("Ci sono modifiche non salvate. Chiudere comunque senza salvare?")) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const odp = (form.odp ?? "").trim();
    if (!odp) { setError("L'ODP non può essere vuoto."); return; }
    if (odp !== scheda.odp && !confirm(`Stai per rinominare l'ODP da "${scheda.odp}" a "${odp}". Le ore e lo storico già registrati con "${scheda.odp}" NON verranno aggiornati e resteranno collegati al vecchio codice. Continuare?`)) {
      return;
    }
    if ((form.commessaId ?? null) !== scheda.commessaId && !confirm(`Stai per spostare questa scheda su un'altra Commessa. L'Area assegnata verrà azzerata e gli eventuali file già caricati su Drive NON verranno spostati nella cartella della nuova commessa. Continuare?`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: SchedaUpdate = {
        ...form,
        odp,
        numeroScheda: (form.numeroScheda ?? "").trim(),
        dataProduzionePrevista: form.dataProduzionePrevista || null,
      };
      const res = await fetch(`/api/schede/${scheda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const updated: Scheda = await res.json();
      onSave(updated);
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    setUploadError("");
    try {
      const pdfBase64 = await readAsBase64(file);
      const res = await fetch(`/api/schede/${scheda.id}/pdf-allegato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, filename: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento PDF");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento PDF");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploadingFoto(true);
    setUploadError("");
    try {
      const fotoBase64 = await Promise.all(files.map(f => compressPhoto(f)));
      const res = await fetch(`/api/schede/${scheda.id}/foto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento foto");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento foto");
    } finally {
      setUploadingFoto(false);
    }
  }

  async function handleCopertinaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingCopertina(true);
    setUploadError("");
    try {
      const imageBase64 = await compressPhoto(file);
      const res = await fetch(`/api/schede/${scheda.id}/copertina`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento copertina");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento copertina");
    } finally {
      setUploadingCopertina(false);
    }
  }

  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemovePdf(fileId: string) {
    if (!confirm("Eliminare questo PDF?")) return;
    setRemovingId(fileId);
    setUploadError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/pdf-allegato/${fileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione PDF");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore eliminazione PDF");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRemoveFoto(fileId: string) {
    if (!confirm("Eliminare questa foto?")) return;
    setRemovingId(fileId);
    setUploadError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/foto/${fileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione foto");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore eliminazione foto");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRemoveCopertina() {
    if (!confirm("Eliminare la copertina?")) return;
    setRemovingId("copertina");
    setUploadError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/copertina`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione copertina");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore eliminazione copertina");
    } finally {
      setRemovingId(null);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";
  const uploadBtnCls = "text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50";
  const uploadBtnStyle = { color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={handleClose}>
      <div
        className="w-full max-w-4xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">Modifica Scheda</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              {scheda.odp} — {scheda.numeroScheda}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>ODP</label>
              <input type="text" className={inputCls} value={form.odp ?? ""} onChange={(e) => set("odp", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "#991B1B" }}>
                Correggi solo per un inserimento errato/doppio: le ore e lo storico già registrati restano collegati al vecchio ODP.
              </p>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Numero Scheda</label>
              <input type="text" className={inputCls} value={form.numeroScheda ?? ""} onChange={(e) => set("numeroScheda", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Articolo</label>
              <input type="text" className={inputCls} value={form.codiceArticolo ?? ""} onChange={(e) => set("codiceArticolo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Posizione</label>
              <input type="text" className={inputCls} value={form.posizione ?? ""} onChange={(e) => set("posizione", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
              <input type="number" min="0" className={inputCls} value={form.quantita ?? ""} onChange={(e) => set("quantita", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Priorità (APS)</label>
              <select className={inputCls} value={form.priorita ?? "media"} onChange={(e) => set("priorita", e.target.value as SchedaUpdate["priorita"])}>
                <option value="critica">Critica</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa</label>
            <select className={inputCls} value={form.commessaId ?? ""} onChange={(e) => handleCommessaChange(e.target.value)}>
              <option value="">— nessuna —</option>
              {commesse.map((c) => (
                <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}{c.localita ? ` (${c.localita})` : ""}</option>
              ))}
            </select>
            {(form.commessaId ?? null) !== scheda.commessaId && (
              <p className="text-xs mt-1" style={{ color: "#991B1B" }}>
                Correggi solo per un inserimento sulla commessa sbagliata: i file già caricati su Drive restano nella cartella della vecchia commessa.
              </p>
            )}
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Area / Cartella</label>
            <div className="flex gap-2">
              <select className={inputCls} value={form.areaId ?? ""} onChange={(e) => set("areaId", e.target.value || null)} disabled={!form.commessaId}>
                <option value="">— nessuna —</option>
                {aree.map((a) => (
                  <option key={a.id} value={a.id}>{a.nomeArredo || "—"}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowFormArea(true)}
                disabled={!form.commessaId}
                className="px-3 py-2 text-sm rounded border font-medium whitespace-nowrap hover:bg-gray-50 transition-colors disabled:opacity-50"
                style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}
              >
                + Nuova
              </button>
            </div>
            {!form.commessaId && (
              <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>Assegna prima una Commessa per poter collegare un&apos;Area.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione</label>
              <select className={inputCls} value={form.statoProduzione} onChange={(e) => set("statoProduzione", e.target.value)}>
                <option value="">— nessuno —</option>
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Prevista</label>
              <input type="date" className={inputCls} value={form.dataProduzionePrevista ?? ""} onChange={(e) => set("dataProduzionePrevista", e.target.value)} />
            </div>
          </div>

          <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
            Fornitore, stato produzione esterna, date di uscita/rientro e Ordine Fornitore si gestiscono dalla tab &quot;Fornitore Esterno&quot;.
          </p>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note Stato</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.noteStato ?? ""} onChange={(e) => set("noteStato", e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={3} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AllegatoSection titolo={`PDF Allegato (${schedaLive.pdfAllegato.length})`}>
              <div className="flex flex-col gap-1">
                {schedaLive.pdfAllegato.map((pdf, i) => (
                  <div key={pdf.id ?? i} className="flex items-center gap-1.5">
                    <a href={pdf.url} target="_blank" rel="noreferrer" className="text-xs underline truncate flex-1" style={{ color: "#DC2626" }}>
                      {pdf.name || `PDF ${i + 1}`}
                    </a>
                    {pdf.id && (
                      <button type="button" onClick={() => handleRemovePdf(pdf.id!)} disabled={removingId === pdf.id}
                        title="Elimina" className="shrink-0 text-xs leading-none disabled:opacity-50" style={{ color: "var(--color-grey-mid)" }}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
              <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={uploadingPdf} className={uploadBtnCls} style={uploadBtnStyle}>
                {uploadingPdf ? "Carico…" : "+ Aggiungi PDF"}
              </button>
            </AllegatoSection>

            <AllegatoSection titolo={`Foto (${schedaLive.foto.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {schedaLive.foto.map((f, i) => (
                  <div key={f.id ?? i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="w-12 h-12 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
                    {f.id && (
                      <button type="button" onClick={() => handleRemoveFoto(f.id!)} disabled={removingId === f.id}
                        title="Elimina" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] flex items-center justify-center disabled:opacity-50"
                        style={{ background: "#991B1B", color: "white" }}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <input ref={fotoInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFotoUpload} />
              <button type="button" onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto} className={uploadBtnCls} style={uploadBtnStyle}>
                {uploadingFoto ? "Carico…" : "+ Aggiungi foto"}
              </button>
            </AllegatoSection>

            <AllegatoSection titolo="Copertina">
              {schedaLive.copertina && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={schedaLive.copertina} alt="Copertina" className="w-full h-16 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
              )}
              <div className="flex gap-2">
                <input ref={copertinaInputRef} type="file" accept="image/*" className="hidden" onChange={handleCopertinaUpload} />
                <button type="button" onClick={() => copertinaInputRef.current?.click()} disabled={uploadingCopertina} className={uploadBtnCls} style={uploadBtnStyle}>
                  {uploadingCopertina ? "Carico…" : schedaLive.copertina ? "Sostituisci" : "+ Carica copertina"}
                </button>
                {schedaLive.copertina && (
                  <button type="button" onClick={handleRemoveCopertina} disabled={removingId === "copertina"}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50"
                    style={{ color: "#DC2626", borderColor: "#fecaca", background: "#FFF5F5" }}>
                    {removingId === "copertina" ? "Elimino…" : "Elimina"}
                  </button>
                )}
              </div>
            </AllegatoSection>
          </div>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: saving ? "var(--color-grey-mid)" : "var(--color-primary)", borderRadius: "var(--radius-button)" }}
            >
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </div>
      {showFormArea && form.commessaId && (
        <FormArea
          commessaId={form.commessaId}
          onClose={() => setShowFormArea(false)}
          onSaved={handleAreaCreata}
        />
      )}
    </div>
  );
}
