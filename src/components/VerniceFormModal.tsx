"use client";

import { useRef, useState } from "react";
import type { TipoBilancioMassa, UnitaMisuraVernice, Vernice } from "@/lib/types";
import { TIPOLOGIE_VERNICIATURA, TIPI_BILANCIO_MASSA_VERNICIATURA } from "@/lib/types";

const ALTRO = "__altro__";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const inputDisabledCls = "w-full border rounded px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed";
const labelCls = "block text-xs font-medium mb-1";

interface Props {
  vernice: Vernice | null;
  onClose: () => void;
  onSalvato: (v: Vernice) => void;
}

export default function VerniceFormModal({ vernice, onClose, onSalvato }: Props) {
  const isEdit = !!vernice;
  const [coloreCodice, setColoreCodice] = useState(vernice?.coloreCodice ?? "");
  const [descrizioneColore, setDescrizioneColore] = useState(vernice?.descrizioneColore ?? "");
  const [fornitore, setFornitore] = useState(vernice?.fornitore ?? "");
  const [codiceTintometro, setCodiceTintometro] = useState(vernice?.codiceTintometro ?? "");
  const [codiceVendita, setCodiceVendita] = useState(vernice?.codiceVendita ?? "");
  const [codiceInventario, setCodiceInventario] = useState(vernice?.codiceInventario ?? "");
  const [unitaMisura, setUnitaMisura] = useState<UnitaMisuraVernice | "">(vernice?.unitaMisura ?? "");
  const tipologiaNota = vernice?.tipologia && TIPOLOGIE_VERNICIATURA.includes(vernice.tipologia);
  const [tipologiaSelezionata, setTipologiaSelezionata] = useState(
    vernice ? (tipologiaNota ? vernice.tipologia : vernice.tipologia ? ALTRO : "") : ""
  );
  const [tipologiaAltro, setTipologiaAltro] = useState(vernice && !tipologiaNota ? vernice.tipologia : "");
  const tipologia = tipologiaSelezionata === ALTRO ? tipologiaAltro : tipologiaSelezionata;
  const [finitura, setFinitura] = useState(vernice?.finitura ?? "");
  const [gloss, setGloss] = useState(vernice?.gloss ?? "");
  const [tipoBilancioMassa, setTipoBilancioMassa] = useState<TipoBilancioMassa | "">(vernice?.tipoBilancioMassa ?? "");
  const [bilancioMassaRaw, setBilancioMassaRaw] = useState(vernice?.bilancioMassaRaw ?? "");
  const [clienteRiferimento, setClienteRiferimento] = useState(vernice?.clienteRiferimento ?? "");
  const [attivo, setAttivo] = useState(vernice?.attivo ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [tsState, setTsState] = useState<{ uploading: boolean; error: string; driveFileId: string | null }>({ uploading: false, error: "", driveFileId: vernice?.tsDriveFileId ?? null });
  const [sdsState, setSdsState] = useState<{ uploading: boolean; error: string; driveFileId: string | null }>({ uploading: false, error: "", driveFileId: vernice?.sdsDriveFileId ?? null });
  const tsInputRef = useRef<HTMLInputElement>(null);
  const sdsInputRef = useRef<HTMLInputElement>(null);

  // Governa se il click sul backdrop può chiudere senza chiedere conferma (stesso pattern di
  // SchedaVerniciaturaModal): confronta lo stato corrente coi valori di partenza (vernice
  // esistente, o vuoto in creazione).
  const dirty =
    coloreCodice !== (vernice?.coloreCodice ?? "") ||
    descrizioneColore !== (vernice?.descrizioneColore ?? "") ||
    fornitore !== (vernice?.fornitore ?? "") ||
    codiceTintometro !== (vernice?.codiceTintometro ?? "") ||
    codiceVendita !== (vernice?.codiceVendita ?? "") ||
    codiceInventario !== (vernice?.codiceInventario ?? "") ||
    unitaMisura !== (vernice?.unitaMisura ?? "") ||
    tipologia !== (vernice?.tipologia ?? "") ||
    finitura !== (vernice?.finitura ?? "") ||
    gloss !== (vernice?.gloss ?? "") ||
    tipoBilancioMassa !== (vernice?.tipoBilancioMassa ?? "") ||
    bilancioMassaRaw !== (vernice?.bilancioMassaRaw ?? "") ||
    clienteRiferimento !== (vernice?.clienteRiferimento ?? "") ||
    attivo !== (vernice?.attivo ?? true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tipologia.trim()) {
      setError("Tipologia obbligatoria.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        coloreCodice: coloreCodice.trim() || null,
        descrizioneColore: descrizioneColore.trim() || null,
        fornitore: fornitore.trim() || null,
        codiceTintometro: codiceTintometro.trim() || null,
        codiceVendita: codiceVendita.trim() || null,
        ...(isEdit ? {} : { codiceInventario: codiceInventario.trim() || null }),
        unitaMisura: unitaMisura || null,
        tipologia: tipologia.trim(),
        finitura: finitura.trim() || null,
        gloss: gloss.trim() || null,
        tipoBilancioMassa: tipoBilancioMassa || null,
        bilancioMassaRaw: bilancioMassaRaw.trim() || null,
        clienteRiferimento: clienteRiferimento || null,
        ...(isEdit ? { attivo } : {}),
      };
      const res = await fetch(isEdit ? `/api/verniciatura/vernici/${vernice!.id}` : "/api/verniciatura/vernici", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSalvato(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocumento(tipo: "ts" | "sds", file: File) {
    const setState = tipo === "ts" ? setTsState : setSdsState;
    setState((s) => ({ ...s, uploading: true, error: "" }));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/verniciatura/vernici/${vernice!.id}/documenti/${tipo}`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setState({ uploading: false, error: "", driveFileId: data.driveFileId ?? null });
    } catch (err) {
      setState((s) => ({ ...s, uploading: false, error: err instanceof Error ? err.message : "Errore upload" }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!dirty) onClose(); }}>
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica vernice" : "Nuova vernice"}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Vale sia per vernici colore sia per ausiliari (catalizzatori, diluenti, induritori) — lascia il codice colore vuoto per un ausiliario.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice colore</label>
              <input type="text" className={inputCls} value={coloreCodice} onChange={(e) => setColoreCodice(e.target.value)} placeholder="es. RAL 7016, NCS S1002-Y50R…" />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione colore</label>
              <input type="text" className={inputCls} value={descrizioneColore} onChange={(e) => setDescrizioneColore(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Tipologia *</label>
            <select className={inputCls} value={tipologiaSelezionata} onChange={(e) => setTipologiaSelezionata(e.target.value)}>
              <option value="">—</option>
              {TIPOLOGIE_VERNICIATURA.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={ALTRO}>Altro (specifica)…</option>
            </select>
            {tipologiaSelezionata === ALTRO && (
              <input type="text" required autoFocus className={inputCls + " mt-2"} value={tipologiaAltro} onChange={(e) => setTipologiaAltro(e.target.value)} placeholder="Specifica la tipologia" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
              <input type="text" className={inputCls} value={fornitore} onChange={(e) => setFornitore(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cliente (riferimento)</label>
              <input type="text" className={inputCls} value={clienteRiferimento} onChange={(e) => setClienteRiferimento(e.target.value)} />
            </div>
          </div>
          <p className="text-xs -mt-2" style={{ color: "var(--color-grey-mid)" }}>
            Entrambi informativi: il fornitore non è ancora collegato a un registro condiviso, il cliente non è il legame ufficiale (quello vive sulle Campionature).
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice tintometro</label>
              <input type="text" className={inputCls} value={codiceTintometro} onChange={(e) => setCodiceTintometro(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice vendita</label>
              <input type="text" className={inputCls} value={codiceVendita} onChange={(e) => setCodiceVendita(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cod. inventario {isEdit && <span className="normal-case font-normal">(non modificabile)</span>}</label>
              <input
                type="text"
                className={isEdit ? inputDisabledCls : inputCls}
                value={codiceInventario}
                onChange={(e) => setCodiceInventario(e.target.value)}
                disabled={isEdit}
                readOnly={isEdit}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Unità di misura</label>
              <select className={inputCls} value={unitaMisura} onChange={(e) => setUnitaMisura(e.target.value as UnitaMisuraVernice | "")}>
                <option value="">—</option>
                <option value="KG">KG</option>
                <option value="LT">LT</option>
                <option value="NR">NR</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Finitura</label>
              <input type="text" className={inputCls} value={finitura} onChange={(e) => setFinitura(e.target.value)} placeholder="opaco, lucido, satinato…" />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Gloss</label>
              <input type="text" className={inputCls} value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="es. 40 GLOSS" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Bilancio di massa (categoria)</label>
              <select className={inputCls} value={tipoBilancioMassa} onChange={(e) => setTipoBilancioMassa(e.target.value as TipoBilancioMassa | "")}>
                <option value="">—</option>
                {TIPI_BILANCIO_MASSA_VERNICIATURA.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Sigla grezza (da import CSV)</label>
              <input type="text" className={inputCls} value={bilancioMassaRaw} onChange={(e) => setBilancioMassaRaw(e.target.value)} placeholder="es. M, H, B…" />
              <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
                Sigla originale del catalogo, migrata così com&apos;era: la mappatura verso la classificazione a sinistra non è ancora nota per tutte le sigle.
              </p>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
              <select
                className={inputCls}
                style={{ color: attivo ? "#166534" : "#991B1B", fontWeight: 600 }}
                value={attivo ? "attiva" : "obsoleta"}
                onChange={(e) => setAttivo(e.target.value === "attiva")}
              >
                <option value="attiva">Attiva (In Uso)</option>
                <option value="obsoleta">Obsoleta</option>
              </select>
            </div>
          )}

          {isEdit && (
            <div className="border-t pt-4 space-y-3" style={{ borderColor: "#E4E0DA" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Documentazione (Drive)</p>
              <div className="flex items-center gap-3">
                {tsState.driveFileId ? (
                  <a href={`/api/drive-file/${tsState.driveFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs px-1.5 py-0.5 rounded font-medium hover:underline" style={{ background: "#D1FAE5", color: "#065F46" }}>
                    TS presente — apri
                  </a>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>TS mancante</span>
                )}
                <input ref={tsInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocumento("ts", f); }} />
                <button type="button" onClick={() => tsInputRef.current?.click()} disabled={tsState.uploading} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
                  {tsState.uploading ? "Carico…" : tsState.driveFileId ? "Sostituisci" : "Carica scheda tecnica"}
                </button>
                {tsState.error && <span className="text-xs" style={{ color: "#991B1B" }}>{tsState.error}</span>}
              </div>
              <div className="flex items-center gap-3">
                {sdsState.driveFileId ? (
                  <a href={`/api/drive-file/${sdsState.driveFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs px-1.5 py-0.5 rounded font-medium hover:underline" style={{ background: "#D1FAE5", color: "#065F46" }}>
                    SDS presente — apri
                  </a>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>SDS mancante</span>
                )}
                <input ref={sdsInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocumento("sds", f); }} />
                <button type="button" onClick={() => sdsInputRef.current?.click()} disabled={sdsState.uploading} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
                  {sdsState.uploading ? "Carico…" : sdsState.driveFileId ? "Sostituisci" : "Carica scheda sicurezza"}
                </button>
                {sdsState.error && <span className="text-xs" style={{ color: "#991B1B" }}>{sdsState.error}</span>}
              </div>
              <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>TS/SDS mancanti generano solo un avviso in validazione ciclo, non bloccano nulla.</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">Annulla</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: saving ? "var(--color-grey-mid)" : "linear-gradient(135deg, #7C3AED, #DB2777)", borderRadius: "var(--radius-button)" }}
            >
              {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Crea vernice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
