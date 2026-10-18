// Parser deterministico per i cartigli delle schede di produzione in PDF (PDM-solid e varianti).
//
// Lavora sulle COORDINATE degli elementi di testo di pdf.js (già trasformate con la viewport, quindi
// con la rotazione di pagina applicata), non sul testo piatto: nel flusso grezzo l'ordine di
// lettura non rispetta la struttura a celle del cartiglio — es. una data può comparire subito dopo
// l'etichetta TERMINE DI CONSEGNA pur essendo il valore di DATA ORDINE (cella impilata sopra).
//
// Principio: si individuano le ETICHETTE note (dizionario sotto), poi ogni altro frammento di testo
// viene associato all'etichetta a cui geometricamente appartiene:
//   (a) stessa riga e a destra dell'etichetta  → valore "affiancato" (PDM-solid: valore allineato a dx)
//   (b) sotto l'etichetta, nella sua colonna   → valore "impilato" (etichetta piccola sopra, valore sotto)
// Le etichette senza campo mappato (FASE, CARICO, …) fanno da "pozzo": assorbono i testi vicini così
// che un campo vuoto non rubi il valore della cella successiva né testo del disegno.
// Un campo con etichetta presente ma nessun valore è VUOTO (null legittimo), non "non trovato":
// solo la pagina senza etichette riconosciute passa al fallback AI.

export interface PdfTextItem {
  s: string;
  x: number; // bordo sinistro, coordinate viewport (origine in alto a sinistra)
  y: number; // baseline
  w: number;
  h: number; // altezza carattere
}

export interface PdfPageData {
  n: number; // numero pagina 1-based
  items: PdfTextItem[];
}

export interface LayoutItem {
  pagina: number;
  numeroScheda: string;
  commessaNr: string;
  termineDiConsegna: string | null;
  codiceArticolo: string | null;
  posizione: string | null;
  fornitore: string | null;
  quantita: number | null;
  otherFields: Record<string, string>;
  warnings: string[];
  source: "layout";
}

export interface LayoutPageResult {
  pagina: number;
  // true se la pagina ha un cartiglio riconosciuto con dati sufficienti: altrimenti va al fallback AI
  ok: boolean;
  item: LayoutItem | null;
}

type FieldKey =
  | "commessa" | "posizione" | "quantita" | "descrizione" | "codiceArticolo"
  | "fornitore" | "dataOrdine" | "termine" | "sink";

// Normalizzazione per il confronto: maiuscole, senza accenti né punteggiatura, spazi compattati.
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

const LABELS: Array<{ re: RegExp; key: FieldKey; nome?: string }> = [
  { re: /^(CODICE COMMESSA|COMMESSA( NR)?|NR COMMESSA)$/, key: "commessa" },
  { re: /^(POSIZIONE|SCHEDA( NR)?)$/, key: "posizione" },
  { re: /^(QUANTITA|QTA|Q TA)$/, key: "quantita" },
  { re: /^DESCRIZIONE$/, key: "descrizione" },
  { re: /^CODICE ARTICOLO$/, key: "codiceArticolo" },
  { re: /^FORNITORE$/, key: "fornitore" },
  { re: /^DATA ORDINE$/, key: "dataOrdine" },
  { re: /^(TERMINE DI CONSEGNA|CONSEGNA ENTRO( IL)?)$/, key: "termine" },
  // Pozzi: etichette note del cartiglio che non importiamo come campo, ma conservate in otherFields
  { re: /^FOGLIO$/, key: "sink", nome: "Foglio" },
  { re: /^PROJECT MANAGER$/, key: "sink", nome: "Project Manager" },
  { re: /^(TECNICO|DISEGNATORE)$/, key: "sink", nome: "Tecnico" },
  { re: /^CODICE U T$/, key: "sink", nome: "Codice U.T." },
  { re: /^CARTELLA ARCHIVIO$/, key: "sink", nome: "Cartella Archivio" },
  { re: /^SCALA( DISEGNO)?$/, key: "sink", nome: "Scala" },
  { re: /^(FASE|CARICO|ODP MODAR|TIPOLOGIA|FINITURA|REVISIONE|FORMATO|NOTE|CONSEGNATO A|IL)$/, key: "sink" },
];

function labelOf(text: string): { key: FieldKey; nome?: string } | null {
  const n = norm(text);
  if (!n || n.length > 24) return null;
  for (const l of LABELS) if (l.re.test(n)) return { key: l.key, nome: l.nome };
  return null;
}

// Unisce frammenti adiacenti sulla stessa riga e della stessa altezza (una stringa spezzata da pdf.js);
// l'etichetta e il suo valore, di altezza diversa o a distanza, restano separati.
function mergeFragments(items: PdfTextItem[]): PdfTextItem[] {
  const sorted = [...items].filter((i) => i.s.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: PdfTextItem[] = [];
  for (const it of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.y - it.y) <= 0.35 * prev.h &&
      Math.abs(prev.h - it.h) <= 0.2 * prev.h &&
      it.x - (prev.x + prev.w) >= -1 &&
      it.x - (prev.x + prev.w) <= 0.9 * prev.h
    ) {
      out[out.length - 1] = { ...prev, s: `${prev.s} ${it.s}`.replace(/\s+/g, " "), w: it.x + it.w - prev.x };
    } else {
      out.push({ ...it, s: it.s.trim() });
    }
  }
  return out;
}

// Larghezza massima della colonna del cartiglio, in multipli dell'altezza dell'etichetta (così vale
// per qualunque formato foglio): PDM-solid ≈ 21, celle impilate ≈ 27. Oltre questo limite il testo è disegno tecnico, non cartiglio.
const COLONNA_MAX_H = 28;

interface LabelFrag extends PdfTextItem { key: FieldKey; nome?: string; src: PdfTextItem }

// Valori associati a ciascuna etichetta, in ordine di lettura (alto→basso, sinistra→destra).
function assignValues(frags: PdfTextItem[], labels: LabelFrag[], allLabelSrc: Set<PdfTextItem>): Map<LabelFrag, PdfTextItem[]> {
  const result = new Map<LabelFrag, PdfTextItem[]>();
  for (const l of labels) result.set(l, []);
  const stacked = new Map<LabelFrag, PdfTextItem[]>();

  for (const v of frags) {
    if (allLabelSrc.has(v)) continue;

    // (a) stessa riga, a destra dell'etichetta, entro la larghezza di una colonna di cartiglio
    let best: LabelFrag | null = null;
    for (const l of labels) {
      if (Math.abs(v.y - l.y) > 0.5 * l.h) continue;
      if (v.x < l.x + 2 || v.x + v.w > l.x + COLONNA_MAX_H * l.h) continue;
      if (!best || v.x - l.x < v.x - best.x) best = l;
    }
    if (best) { result.get(best)!.push(v); continue; }

    // (b) sotto l'etichetta nella sua colonna: la più vicina verso l'alto
    let above: LabelFrag | null = null;
    for (const l of labels) {
      if (v.y - l.y < 0.5 * l.h) continue;
      if (v.x < l.x - 3 * l.h || v.x + v.w > l.x + COLONNA_MAX_H * l.h) continue;
      if (!above || v.y - l.y < v.y - above.y) above = l;
    }
    if (above) {
      if (!stacked.has(above)) stacked.set(above, []);
      stacked.get(above)!.push(v);
    }
  }

  // Le righe impilate si accettano solo se "attaccate" all'etichetta e tra loro (catena contigua):
  // testo di disegno o cartiglio non etichettato più in basso non viene attribuito per errore.
  for (const [l, vs] of stacked) {
    if (result.get(l)!.length) continue; // valore già affiancato: niente righe impilate
    vs.sort((a, b) => a.y - b.y || a.x - b.x);
    let prevY = l.y;
    let prevH = l.h;
    let first = true;
    for (const v of vs) {
      const gap = v.y - prevY;
      const limit = first ? 12 * l.h : 3.5 * Math.max(prevH, v.h);
      if (gap > limit) break;
      result.get(l)!.push(v);
      prevY = v.y;
      prevH = v.h;
      first = false;
    }
  }

  for (const vs of result.values()) vs.sort((a, b) => Math.round(a.y / 3) - Math.round(b.y / 3) || a.x - b.x);
  return result;
}

const joinValues = (vs: PdfTextItem[], sep = " "): string => vs.map((v) => v.s).join(sep).replace(/\s+/g, " ").trim();

// Date del cartiglio: dd.mm.yyyy · dd/mm/yyyy · dd-mm-yyyy (anche anno a 2 cifre). Restituisce ISO o null.
export function parseDataCartiglio(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})\b/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  let y = +m[3];
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2020 || y > 2045) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const CONNETTIVI = /^(PER|DI|DEL|DELLA|DELLE|DEI|E|IN|CON|DA|A|SU|TRA|FRA)$/;

// La DESCRIZIONE è spesso su più righe: la prima è il titolo, le successive sono specifiche
// (materiale, finitura). Una riga che finisce con "-" o con una preposizione, o una successiva che
// inizia con una preposizione, è però la continuazione del titolo ("LAMIERE OTTONE PER" / "MENSOLA").
// Le righe fatte solo di numeri (quote finite nella colonna) non sono titolo.
export function titoloDescrizione(righe: string[]): string {
  const r = righe.filter((x) => /[A-Za-zÀ-ÿ]/.test(x));
  if (!r.length) return "";
  let titolo = r[0];
  for (let i = 1; i < r.length; i++) {
    const ultima = titolo.split(/\s+/).pop()!.toUpperCase();
    const prima = r[i].split(/\s+/)[0].toUpperCase();
    if (titolo.endsWith("-") || CONNETTIVI.test(ultima) || CONNETTIVI.test(prima)) titolo = `${titolo} ${r[i]}`;
    else break;
  }
  return titolo.replace(/\s+/g, " ").trim();
}

export function parsePage(page: PdfPageData): LayoutPageResult {
  const frags = mergeFragments(page.items);
  const labels: LabelFrag[] = [];
  for (const f of frags) {
    const l = labelOf(f.s);
    if (l) labels.push({ ...f, ...l, src: f });
  }
  // Se la stessa etichetta compare più volte (testo del disegno), si tiene l'istanza che sta nel
  // gruppo più denso di altre etichette: il cartiglio ha 10+ etichette ravvicinate.
  const byKey = new Map<string, LabelFrag[]>();
  for (const l of labels) {
    const k = l.key === "sink" ? norm(l.s) : l.key;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(l);
  }
  const chosen = new Set<LabelFrag>();
  for (const group of byKey.values()) {
    if (group.length === 1) { chosen.add(group[0]); continue; }
    const score = (l: LabelFrag) => labels.filter((o) => Math.abs(o.x - l.x) < 3 * l.h).length;
    chosen.add(group.reduce((a, b) => (score(b) > score(a) ? b : a)));
  }
  const activeLabels = labels.filter((l) => chosen.has(l));

  const keys = new Set(activeLabels.map((l) => l.key));
  const hasCore = keys.has("commessa") && (keys.has("posizione") || keys.has("descrizione"));
  if (!hasCore) return { pagina: page.n, ok: false, item: null };

  const values = assignValues(frags, activeLabels, new Set(labels.map((l) => l.src)));
  const get = (key: FieldKey): { present: boolean; text: string; parts: PdfTextItem[] } => {
    const ls = activeLabels.filter((l) => l.key === key);
    if (!ls.length) return { present: false, text: "", parts: [] };
    const parts = ls.flatMap((l) => values.get(l) ?? []);
    return { present: true, text: joinValues(parts), parts };
  };

  const warnings: string[] = [];

  const commessaTxt = get("commessa").text;
  const commessaNr = commessaTxt.match(/\d{4,7}/)?.[0] ?? "";
  if (!commessaNr) warnings.push("Numero commessa non letto dal cartiglio");

  const posizione = get("posizione").text || null;
  const descr = get("descrizione");
  const descrPrincipale = titoloDescrizione(descr.parts.map((p) => p.s));
  const numeroScheda = [posizione, descrPrincipale].filter(Boolean).join(" - ");

  const quantitaTxt = get("quantita").text;
  let quantita = quantitaTxt.match(/\d+/) ? parseInt(quantitaTxt.match(/\d+/)![0], 10) : null;

  const fornTxt = get("fornitore").text;
  const fornitore = fornTxt && !/^MODAR\b/i.test(fornTxt) ? fornTxt : null;

  // Formati senza etichetta per codice articolo / quantità (es. "VA018.8", "1 PZ"): si cercano tra i
  // testi della colonna del cartiglio non assegnati a nessuna etichetta, solo con forma inequivocabile.
  const assegnati = new Set<PdfTextItem>();
  for (const vs of values.values()) for (const v of vs) assegnati.add(v);
  const xs = activeLabels.map((l) => l.x).sort((a, b) => a - b);
  const colX = xs[Math.floor(xs.length / 2)];
  const hRef = activeLabels[0].h;
  const nelCartiglio = (v: PdfTextItem) =>
    !assegnati.has(v) && !labels.some((l) => l.src === v) && v.x >= colX - 3 * hRef && v.x + v.w <= colX + COLONNA_MAX_H * hRef;
  const orfani = frags.filter(nelCartiglio);

  let codiceArticolo = joinValues(get("codiceArticolo").parts, ", ") || null;
  if (!keys.has("codiceArticolo")) {
    codiceArticolo = orfani.find((v) => /^[A-Z]{1,4}\d{2,5}[A-Z]?(\.\d+)*$/.test(v.s))?.s ?? null;
  }
  if (!keys.has("quantita") && quantita === null) {
    const q = orfani.map((v) => v.s.match(/^(\d{1,4})\s*(PZ|PEZZI|NR)\.?$/i)).find(Boolean);
    if (q) quantita = parseInt(q[1], 10);
  }

  const termine = get("termine");
  let termineDiConsegna: string | null = null;
  if (termine.present) {
    if (termine.text) {
      termineDiConsegna = parseDataCartiglio(termine.text);
      if (!termineDiConsegna) warnings.push(`Termine di consegna non riconosciuto: "${termine.text}"`);
    } else {
      warnings.push("TERMINE DI CONSEGNA vuoto nel cartiglio");
    }
  } else {
    warnings.push("Etichetta TERMINE DI CONSEGNA non trovata nella pagina");
  }

  const dataOrdineTxt = get("dataOrdine").text;
  const dataOrdine = dataOrdineTxt ? parseDataCartiglio(dataOrdineTxt) : null;
  if (termineDiConsegna && dataOrdine && termineDiConsegna < dataOrdine) {
    warnings.push("Termine di consegna precedente alla data ordine");
  }

  const otherFields: Record<string, string> = {};
  if (descr.parts.length > 1) otherFields["Descrizione"] = joinValues(descr.parts, " · ");
  if (dataOrdine) otherFields["Data Ordine"] = dataOrdine;
  for (const l of activeLabels) {
    if (l.key !== "sink" || !l.nome) continue;
    const txt = joinValues(values.get(l) ?? []);
    if (txt && !(l.nome in otherFields)) otherFields[l.nome] = txt;
  }

  return {
    pagina: page.n,
    ok: !!commessaNr && !!numeroScheda,
    item: {
      pagina: page.n, numeroScheda, commessaNr, termineDiConsegna, codiceArticolo,
      posizione, fornitore, quantita, otherFields, warnings, source: "layout",
    },
  };
}

// Controlli incrociati sul documento intero (stessa commessa su tutte le pagine).
export function parseDocument(pages: PdfPageData[]): LayoutPageResult[] {
  const results = pages.map(parsePage);
  const counts = new Map<string, number>();
  for (const r of results) if (r.item?.commessaNr) counts.set(r.item.commessaNr, (counts.get(r.item.commessaNr) ?? 0) + 1);
  if (counts.size > 1) {
    const dominante = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const r of results) {
      if (r.item && r.item.commessaNr && r.item.commessaNr !== dominante) {
        r.item.warnings.push(`Commessa ${r.item.commessaNr} diversa dalle altre pagine (${dominante})`);
      }
    }
  }
  return results;
}
