"use client";

import { useRef, useState } from "react";
import type { ColoreSistema, Laboratorio, RuoloVernice, TipoBilancioMassa, UnitaMisuraVernice, Vernice } from "@/lib/types";
import { CLIENTI_VERNICIATURA, FAMIGLIE_PRODOTTO_VERNICIATURA } from "@/lib/types";

const ALTRO = "__altro__";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-xs font-medium mb-1";

interface Props {
  vernice: Vernice | null;
  laboratori: Laboratorio[];
  onClose: () => void;
  onSalvato: (v: Vernice) => void;
}

export default function VerniceFormModal({ vernice, laboratori, onClose, onSalvato }: Props) {
  const isEdit = !!vernice;
  const [coloreSistema, setColoreSistema] = useState<ColoreSistema | "">(vernice?.coloreSistema ?? "");
  const [coloreCodice, setColoreCodice] = useState(vernice?.coloreCodice ?? "");
  const [coloreNome, setColoreNome] = useState(vernice?.coloreNome ?? "");
  const [fornitoreId, setFornitoreId] = useState(vernice?.fornitoreId ?? "");
  const [laboratorioId, setLaboratorioId] = useState(vernice?.laboratorioId ?? "");
  const [codiceTintometro, setCodiceTintometro] = useState(vernice?.codiceTintometro ?? "");
  const [codiceVendita, setCodiceVendita] = useState(vernice?.codiceVendita ?? "");
  const [codiceInventario, setCodiceInventario] = useState(vernice?.codiceInventario ?? "");
  const [unitaMisura, setUnitaMisura] = useState<UnitaMisuraVernice | "">(vernice?.unitaMisura ?? "");
  const famigliaNota = vernice?.famigliaProdotto && FAMIGLIE_PRODOTTO_VERNICIATURA.includes(vernice.famigliaProdotto);
  const [famigliaProdottoSelezionata, setFamigliaProdottoSelezionata] = useState(
    vernice ? (famigliaNota ? vernice.famigliaProdotto : vernice.famigliaProdotto ? ALTRO : "") : ""
  );
  const [famigliaProdottoAltro, setFamigliaProdottoAltro] = useState(vernice && !famigliaNota ? vernice.famigliaProdotto : "");
  const famigliaProdotto = famigliaProdottoSelezionata === ALTRO ? famigliaProdottoAltro : famigliaProdottoSelezionata;
  const [ruolo, setRuolo] = useState<RuoloVernice | "">(vernice?.ruolo ?? "");
  const [finitura, setFinitura] = useState(vernice?.finitura ?? "");
  const [gloss, setGloss] = useState(vernice?.gloss ?? "");
  const [tipoBilancioMassa, setTipoBilancioMassa] = useState<TipoBilancioMassa | "">(vernice?.tipoBilancioMassa ?? "");
  const [bilancioMassaRaw, setBilancioMassaRaw] = useState(vernice?.bilancioMassaRaw ?? "");
  const [clienteRiferimento, setClienteRiferimento] = useState(vernice?.clienteRiferimento ?? "");
  const [attivo, setAttivo] = useState(vernice?.attivo ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [tsState, setTsState] = useState<{ uploading: boolean; error: string; presente: boolean }>({ uploading: false, error: "", presente: !!vernice?.tsDriveFileId });
  const [sdsState, setSdsState] = useState<{ uploading: boolean; error: string; presente: boolean }>({ uploading: false, error: "", presente: !!vernice?.sdsDriveFileId });
  const tsInputRef = useRef<HTMLInputElement>(null);
  const sdsInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!famigliaProdotto.trim()) {
      setError("Famiglia prodotto obbligatoria.");
      return;
    }
    if (coloreSistema && !coloreCodice.trim()) {
      setError("Colore codice obbligatorio quando è indicato un sistema colore.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        coloreSistema: coloreSistema || null,
        coloreCodice: coloreSistema ? coloreCodice.trim() : null,
        coloreNome: coloreNome.trim() || null,
        fornitoreId: fornitoreId || null,
        laboratorioId: laboratorioId || null,
        codiceTintometro: codiceTintometro.trim() || null,
        codiceVendita: codiceVendita.trim() || null,
        codiceInventario: codiceInventario.trim() || null,
        unitaMisura: unitaMisura || null,
        famigliaProdotto: famigliaProdotto.trim(),
        ruolo: ruolo || null,
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
      setState({ uploading: false, error: "", presente: true });
    } catch (err) {
      setState((s) => ({ ...s, uploading: false, error: err instanceof Error ? err.message : "Errore upload" }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica vernice" : "Nuova vernice"}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Vale sia per vernici colore sia per ausiliari (catalizzatori, diluenti, induritori) — lascia sistema/codice colore vuoti per un ausiliario.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Sistema colore</label>
              <select className={inputCls} value={coloreSistema} onChange={(e) => setColoreSistema(e.target.value as ColoreSistema | "")}>
                <option value="">— Ausiliario / nessun colore —</option>
                <option value="RAL">RAL</option>
                <option value="NCS">NCS</option>
                <option value="Pantone">Pantone</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Colore codice {coloreSistema && "*"}</label>
              <input type="text" className={inputCls} value={coloreCodice} onChange={(e) => setColoreCodice(e.target.value)} placeholder={coloreSistema === "RAL" ? "es. 7016" : "es. codice"} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Colore nome</label>
            <input type="text" className={inputCls} value={coloreNome} onChange={(e) => setColoreNome(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Famiglia prodotto *</label>
              <select className={inputCls} value={famigliaProdottoSelezionata} onChange={(e) => setFamigliaProdottoSelezionata(e.target.value)}>
                <option value="">—</option>
                {FAMIGLIE_PRODOTTO_VERNICIATURA.map((f) => <option key={f} value={f}>{f}</option>)}
                <option value={ALTRO}>Altro (specifica)…</option>
              </select>
              {famigliaProdottoSelezionata === ALTRO && (
                <input type="text" required autoFocus className={inputCls + " mt-2"} value={famigliaProdottoAltro} onChange={(e) => setFamigliaProdottoAltro(e.target.value)} placeholder="Specifica la famiglia prodotto" />
              )}
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Ruolo</label>
              <select className={inputCls} value={ruolo} onChange={(e) => setRuolo(e.target.value as RuoloVernice | "")}>
                <option value="">— Nessuno (ausiliario) —</option>
                <option value="fondo">Fondo</option>
                <option value="finitura">Finitura</option>
                <option value="trasparente">Trasparente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
              <select className={inputCls} value={fornitoreId} onChange={(e) => setFornitoreId(e.target.value)}>
                <option value="">—</option>
                {laboratori.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Laboratorio tintometrico</label>
              <select className={inputCls} value={laboratorioId} onChange={(e) => setLaboratorioId(e.target.value)}>
                <option value="">—</option>
                {laboratori.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cliente (riferimento)</label>
            <select className={inputCls} value={clienteRiferimento} onChange={(e) => setClienteRiferimento(e.target.value)}>
              <option value="">—</option>
              {CLIENTI_VERNICIATURA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
              Informativo, non è il legame ufficiale col cliente (quello vive sulle Campionature) — utile per non perdere il riferimento su vernici migrate senza ancora una campionatura reale.
            </p>
          </div>

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
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cod. inventario</label>
              <input type="text" className={inputCls} value={codiceInventario} onChange={(e) => setCodiceInventario(e.target.value)} />
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
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Bilancio di massa (classificazione VOC)</label>
              <select className={inputCls} value={tipoBilancioMassa} onChange={(e) => setTipoBilancioMassa(e.target.value as TipoBilancioMassa | "")}>
                <option value="">—</option>
                <option value="solvente">Solvente</option>
                <option value="acqua">Acqua</option>
                <option value="polvere">Polvere</option>
                <option value="primer">Primer</option>
                <option value="smalto">Smalto</option>
                <option value="altro">Altro</option>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} className="w-4 h-4 accent-orange-500" />
              Attiva
            </label>
          )}

          {isEdit && (
            <div className="border-t pt-4 space-y-3" style={{ borderColor: "#E4E0DA" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Documentazione (Drive)</p>
              <div className="flex items-center gap-3">
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={tsState.presente ? { background: "#D1FAE5", color: "#065F46" } : { background: "#FEE2E2", color: "#991B1B" }}>
                  {tsState.presente ? "TS presente" : "TS mancante"}
                </span>
                <input ref={tsInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocumento("ts", f); }} />
                <button type="button" onClick={() => tsInputRef.current?.click()} disabled={tsState.uploading} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
                  {tsState.uploading ? "Carico…" : "Carica scheda tecnica"}
                </button>
                {tsState.error && <span className="text-xs" style={{ color: "#991B1B" }}>{tsState.error}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={sdsState.presente ? { background: "#D1FAE5", color: "#065F46" } : { background: "#FEE2E2", color: "#991B1B" }}>
                  {sdsState.presente ? "SDS presente" : "SDS mancante"}
                </span>
                <input ref={sdsInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocumento("sds", f); }} />
                <button type="button" onClick={() => sdsInputRef.current?.click()} disabled={sdsState.uploading} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
                  {sdsState.uploading ? "Carico…" : "Carica scheda sicurezza"}
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
