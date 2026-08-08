import { Client } from "@notionhq/client";
import { unstable_cache } from "next/cache";
import type { Scheda, SchedaUpdate, Ritiro, RitiroUpdate, Commessa, Area, Carico, CaricoUpdate, Operatore, OdpAttivo } from "./types";
import { STATI_CHIUSI_ODP } from "./types";

const notion = new Client({ auth: process.env.NOTION_TOKEN, fetch: globalThis.fetch });

const DB_SCHEDE = process.env.NOTION_DB_SCHEDE!;
const DB_COMMESSE = process.env.NOTION_DB_COMMESSE!;
const DB_AREE = process.env.NOTION_DB_AREE!;
const DB_RITIRI = process.env.NOTION_DB_RITIRI!;
const DB_CARICHI = process.env.NOTION_DB_CARICHI!;
const DB_FORNITORI = process.env.NOTION_DB_FORNITORI!;
const DB_OPERATORI = process.env.NOTION_DB_OPERATORI!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prop(page: any, name: string): any {
  return page.properties?.[name];
}

function getText(p: ReturnType<typeof prop>): string {
  if (!p) return "";
  if (p.type === "title") return p.title?.map((t: { plain_text: string }) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") ?? "";
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "status") return p.status?.name ?? "";
  if (p.type === "phone_number") return p.phone_number ?? "";
  if (p.type === "email") return p.email ?? "";
  if (p.type === "url") return p.url ?? "";
  if (p.type === "formula") return p.formula?.string ?? String(p.formula?.number ?? "");
  if (p.type === "rollup") {
    const arr = p.rollup?.array;
    if (Array.isArray(arr) && arr[0]) return getText(arr[0]);
    return "";
  }
  return "";
}

function getDate(p: ReturnType<typeof prop>): string | null {
  if (!p || p.type !== "date") return null;
  return p.date?.start ?? null;
}

function getNumber(p: ReturnType<typeof prop>): number | null {
  if (!p) return null;
  if (p.type === "number") return p.number ?? null;
  if (p.type === "formula") return p.formula?.number ?? null;
  return null;
}

function getCheckbox(p: ReturnType<typeof prop>): boolean {
  if (!p || p.type !== "checkbox") return false;
  return p.checkbox ?? false;
}

function getFiles(p: ReturnType<typeof prop>): { name: string; url: string }[] {
  if (!p) return [];
  if (p.type === "files") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (p.files ?? []).map((f: any) => ({
      name: f.name,
      url: f.type === "external" ? f.external?.url : f.file?.url ?? "",
    }));
  }
  if (p.type === "rollup") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (p.rollup?.array ?? []).flatMap((item: any) => {
      if (item.type !== "files") return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (item.files ?? []).map((f: any) => ({
        name: f.name,
        url: f.type === "external" ? f.external?.url : f.file?.url ?? "",
      }));
    });
  }
  return [];
}

function getRelationId(p: ReturnType<typeof prop>): string | null {
  if (!p || p.type !== "relation") return null;
  return p.relation?.[0]?.id ?? null;
}

function getRelationIds(p: ReturnType<typeof prop>): string[] {
  if (!p || p.type !== "relation") return [];
  return (p.relation ?? []).map((r: { id: string }) => r.id);
}

function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryAll(dbId: string, filter?: any, sorts?: any[], maxPages = 1000): Promise<any[]> {
  const results = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter,
      sorts,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    pages++;
  } while (cursor && pages < maxPages);
  return results;
}

function extractCommessaNr(clienteInfo: string): string {
  const m = clienteInfo.match(/^\d+/);
  return m ? m[0] : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToScheda(page: any): Scheda {
  const clienteInfo = getText(prop(page, "Cliente Info"));
  return {
    id: page.id,
    odp: getText(prop(page, "ODP")),
    clienteInfo,
    numeroScheda: getText(prop(page, "Numero Scheda")),
    descrizioneFasi: getText(prop(page, "Descrizione/Fasi/Piano/Stanza")),
    codiceArticolo: getText(prop(page, "Codice Art.")),
    posizione: getText(prop(page, "Posizione")),
    quantita: getNumber(prop(page, "Quantità")),
    tipologia: getText(prop(page, "Tipologia")),
    statoProduzione: getText(prop(page, "Stato")),
    faseCorrente: getText(prop(page, "Fase Corrente")),
    dataSchedaRicevuta: getDate(prop(page, "Data Scheda Ricevuta")),
    dataProduzionePrevista: getDate(prop(page, "Data Produzione Prevista")),
    pdfAllegato: getFiles(prop(page, "PDF Allegato")),
    foto: getFiles(prop(page, "Foto")),
    produzioneEsterna: getCheckbox(prop(page, "Produzione Esterna")),
    statoProdEsterna: getText(prop(page, "Stato Produzione Esterna")),
    fornitore: getText(prop(page, "Nome Fornitore")),
    ordineFornitore: getText(prop(page, "Ordine Fornitore")),
    pdfOrdineFornitore: getFiles(prop(page, "Ordine Fornitore")),
    dataRientroPrevista: getDate(prop(page, "Data Rientro Prevista")),
    dataUscitaMateriale: getDate(prop(page, "Data Uscita Materiale")),
    dataRientroEffettiva: getDate(prop(page, "Data Rientro Effettiva")),
    copertina: getFiles(prop(page, "Copertina"))[0]?.url ?? null,
    note: getText(prop(page, "Descrizione/Fasi/Piano/Stanza")),
    commessaId: getRelationId(prop(page, "Commessa Nr")),
    commessaNr: extractCommessaNr(clienteInfo),
    areaId: getRelationId(prop(page, "Area-Cartella Commessa")),
    areaLabel: getText(prop(page, "Area-Cartella Commessa")),
    parentId: getRelationId(prop(page, "Parent item")),
    notionUrl: notionUrl(page.id),
    kitFerramenta: getText(prop(page, "Kit Ferramenta")),
    noteStato: getText(prop(page, "Note Stato")),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToRitiro(page: any, fornitoriMap?: Record<string, string>): Ritiro {
  const urgenzaProp = prop(page, "Urgenza");
  const urgenza =
    urgenzaProp?.type === "checkbox"
      ? (urgenzaProp.checkbox ?? false)
      : getText(urgenzaProp).toLowerCase().startsWith("s");
  const descrizione = getText(prop(page, "Descrizione")); // title property
  const fornitoreId = getRelationId(prop(page, "Fornitore"));
  const fornitore = (fornitoreId && fornitoriMap?.[fornitoreId]) ?? "";
  return {
    id: page.id,
    causale: descrizione,
    numeroOrdine: getText(prop(page, "ODP")),
    numeroOrdineId: getRelationId(prop(page, "Scheda")),
    rilavorazioneId: getRelationId(prop(page, "Rilavorazione")),
    commessaId: getRelationId(prop(page, "Commessa")),
    commessaNr: getText(prop(page, "Nr Commessa")),
    descrizioneMerce: descrizione,
    dataTrasporto: getDate(prop(page, "Data Trasporto")),
    dataFatto: getDate(prop(page, "Data Fatto")),
    tipoMovimento: getText(prop(page, "Tipo movimento")),
    stato: getText(prop(page, "Stato")),
    urgenza,
    nc: getCheckbox(prop(page, "NC")),
    nrCollo: getNumber(prop(page, "Nr Collo")),
    totColli: getNumber(prop(page, "Tot Colli")),
    fornitore,
    ordineFornitore: getFiles(prop(page, "Ordine Fornitore")),
    note: descrizione,
    documentiAllegati: [],
    pdfScheda: getFiles(prop(page, "PDF Allegato")),
    pdfOrdineFornitore: getFiles(prop(page, "PDF Ordine Fornitore")),
    foto: getFiles(prop(page, "Foto")),
    notionUrl: notionUrl(page.id),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToCommessa(page: any): Commessa {
  return {
    id: page.id,
    numeroCommessa: getText(prop(page, "Numero Commessa")),
    cliente: getText(prop(page, "Cliente")),
    localita: getText(prop(page, "Località")),
    info: getText(prop(page, "Info")),
    responsabile: getText(prop(page, "Responsabile")),
    stato: getText(prop(page, "Stato")),
    dataCarico: getDate(prop(page, "Data Carico")),
    inizioMontaggio: getDate(prop(page, "Inizio Montaggio")),
    fineMontaggio: getDate(prop(page, "Fine Montaggio")),
    giorniMontaggio: getNumber(prop(page, "Giorni Montaggio")),
    notionUrl: notionUrl(page.id),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToArea(page: any): Area {
  return {
    id: page.id,
    nomeArredo: getText(prop(page, "Nome Arredo")),
    cliente: getText(prop(page, "CLIENTE")),
    codiceArticoloA: getText(prop(page, "Codice Articolo A")),
    commessaId: getRelationId(prop(page, "Commessa")),
    commessaCliente: getText(prop(page, "CommessaCliente")),
    completamento: getNumber(prop(page, "Completamento")),
    dataConsegnaPrevista: getDate(prop(page, "Data Consegna Prevista")),
    descrizione: getText(prop(page, "Descrizione")),
    localitaCliente: getText(prop(page, "Località Cliente")),
    note: getText(prop(page, "Note")),
    posizione: getText(prop(page, "Posizione")),
    quantita: getNumber(prop(page, "Quantità")),
    statoCommessa: getText(prop(page, "Stato Commessa")),
    statoProduzione: getText(prop(page, "Stato Produzione")),
    notionUrl: notionUrl(page.id),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToCarico(page: any): Carico {
  return {
    id: page.id,
    titolo: getText(prop(page, "Titolo")),
    descrizione: getText(prop(page, "Descrizione")),
    dataCarico: getDate(prop(page, "Data Carico")),
    commessaId: getRelationId(prop(page, "Commessa")),
    odpIds: getRelationIds(prop(page, "ODP")),
    modalita: getText(prop(page, "Modalità")),
    stato: getText(prop(page, "Stato")),
    documenti: getFiles(prop(page, "Documenti")),
    notionUrl: notionUrl(page.id),
  };
}

export async function getCarichi(): Promise<Carico[]> {
  const pages = await queryAll(DB_CARICHI, undefined, [
    { property: "Data Carico", direction: "ascending" },
  ]);
  return pages.map(pageToCarico);
}

export async function getCarichiByCommessa(commessaId: string): Promise<Carico[]> {
  const pages = await queryAll(DB_CARICHI, {
    property: "Commessa",
    relation: { contains: commessaId },
  });
  return pages.map(pageToCarico);
}

export async function createRitiro({
  causale,
  tipoMovimento,
  dataTrasporto,
  urgenza,
  nc,
  nrCollo,
  totColli,
  schedaId,
  fornitoreId,
  rilavorazioneId,
  commessaId,
}: {
  causale: string;
  tipoMovimento?: string;
  dataTrasporto?: string | null;
  urgenza?: boolean;
  nc?: boolean;
  nrCollo?: number | null;
  totColli?: number | null;
  schedaId?: string | null;
  fornitoreId?: string | null;
  rilavorazioneId?: string | null;
  commessaId?: string | null;
}): Promise<Ritiro> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Descrizione: { title: [{ text: { content: causale } }] },
    Stato: { status: { name: "Da Fare" } },
  };
  if (dataTrasporto) properties["Data Trasporto"] = { date: { start: dataTrasporto } };
  if (tipoMovimento) properties["Tipo movimento"] = { select: { name: tipoMovimento } };
  if (urgenza !== undefined) properties["Urgenza"] = { select: { name: urgenza ? "Si" : "No" } };
  if (nc !== undefined) properties["NC"] = { checkbox: nc };
  if (nrCollo != null) properties["Nr Collo"] = { number: nrCollo };
  if (totColli != null) properties["Tot Colli"] = { number: totColli };
  if (schedaId) properties["Scheda"] = { relation: [{ id: schedaId }] };
  if (fornitoreId) properties["Fornitore"] = { relation: [{ id: fornitoreId }] };
  if (rilavorazioneId) properties["Rilavorazione"] = { relation: [{ id: rilavorazioneId }] };
  if (commessaId) properties["Commessa"] = { relation: [{ id: commessaId }] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({ parent: { database_id: DB_RITIRI }, properties }) as any;
  return pageToRitiro(page);
}

// Logica condivisa di creazione rilavorazione: usata dal wizard (scheda dettaglio)
// e dallo shortcut NC in Carico Magazzino. Crea la scheda figlia, sblocca lo stato
// del padre ("In Attesa Rilavorazione") ed eventualmente crea la Consegna collegata.
export async function createRilavorazione({
  parentId,
  descrizione,
  fornitoreNome,
  fornitoreId: fornitoreIdOverride,
  note,
  dataRientro,
  quantita,
  creaRitiro,
  parent: parentOverride,
}: {
  parentId: string;
  descrizione: string;
  fornitoreNome?: string | null;
  fornitoreId?: string | null;
  note?: string | null;
  dataRientro?: string | null;
  quantita?: number | null;
  creaRitiro?: boolean;
  parent?: Scheda;
}): Promise<{ rilavorazione: Scheda; subOdp: string; parent: Scheda; ritiro: Ritiro | null; ritiroError?: string }> {
  const parent = parentOverride ?? await getSchedaById(parentId);

  const [subOdp, fornitoreId] = await Promise.all([
    getNextRilavorazioneOdp(parentId, parent.odp),
    fornitoreIdOverride
      ? Promise.resolve(fornitoreIdOverride)
      : fornitoreNome ? findFornitoreIdByName(fornitoreNome) : Promise.resolve(null),
  ]);

  const rilavorazione = await createSchedaPage({
    numeroScheda: descrizione,
    commessaId: parent.commessaId,
    odp: subOdp,
    tipologia: "Rilavorazione",
    stato: "In lavorazione Esterna",
    fornitore: fornitoreNome ?? null,
    fornitoreId,
    note: note ?? null,
    dataProduzionePrevista: dataRientro ?? null,
    // Una Rilavorazione è per definizione fuori sede (dal fornitore) — senza questo flag
    // l'alert "rientro in ritardo" già esistente per le Schede normali non scatta mai qui,
    // e il filtro "Produzione Esterna" in Tabella Schede le esclude sempre.
    produzioneEsterna: true,
    dataRientroPrevista: dataRientro ?? null,
    quantita: quantita ?? parent.quantita ?? null,
    parentId,
  });

  await updateSchedaStato(parentId, "In Attesa Rilavorazione");

  let ritiro: Ritiro | null = null;
  let ritiroError: string | undefined;
  if (creaRitiro && fornitoreId) {
    try {
      ritiro = await createRitiro({
        causale: `Rilavorazione — ${subOdp}`,
        tipoMovimento: "Consegna",
        dataTrasporto: dataRientro ?? new Date().toISOString().slice(0, 10),
        schedaId: rilavorazione.id,
        fornitoreId,
        rilavorazioneId: rilavorazione.id,
      });
    } catch (e) {
      console.error("[createRilavorazione] createRitiro:", e);
      ritiroError = (e as Error).message;
    }
  }

  return { rilavorazione, subOdp, parent, ritiro, ritiroError };
}

export async function createCarico({
  titolo,
  descrizione,
  dataCarico,
  commessaId,
  odpIds,
  modalita,
  stato,
}: {
  titolo: string;
  descrizione?: string;
  dataCarico: string;
  commessaId?: string | null;
  odpIds?: string[];
  modalita?: string;
  stato?: string;
}): Promise<Carico> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Titolo: { title: [{ text: { content: titolo || "Carico" } }] },
    "Data Carico": { date: { start: dataCarico } },
    // Stato di default "Pianificato" per i carichi appena creati — sovrascrivibile solo
    // se il chiamante passa esplicitamente uno stato (es. form di creazione con selettore).
    Stato: { status: { name: stato || "Pianificato" } },
  };
  if (descrizione) properties["Descrizione"] = { rich_text: [{ text: { content: descrizione } }] };
  if (commessaId) properties["Commessa"] = { relation: [{ id: commessaId }] };
  if (odpIds && odpIds.length) properties["ODP"] = { relation: odpIds.map((id) => ({ id })) };
  if (modalita) properties["Modalità"] = { select: { name: modalita } };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({ parent: { database_id: DB_CARICHI }, properties }) as any;
  return pageToCarico(page);
}

export async function updateCarico(id: string, data: CaricoUpdate): Promise<Carico> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  if (data.titolo !== undefined)
    properties["Titolo"] = { title: [{ text: { content: data.titolo } }] };
  if (data.descrizione !== undefined)
    properties["Descrizione"] = { rich_text: data.descrizione ? [{ text: { content: data.descrizione } }] : [] };
  if (data.dataCarico !== undefined)
    properties["Data Carico"] = { date: data.dataCarico ? { start: data.dataCarico } : null };
  if (data.commessaId !== undefined)
    properties["Commessa"] = data.commessaId ? { relation: [{ id: data.commessaId }] } : { relation: [] };
  if (data.odpIds !== undefined)
    properties["ODP"] = { relation: data.odpIds.map((odpId) => ({ id: odpId })) };
  if (data.modalita !== undefined)
    properties["Modalità"] = { select: data.modalita ? { name: data.modalita } : null };
  if (data.stato !== undefined)
    properties["Stato"] = { status: { name: data.stato } };

  await notion.pages.update({ page_id: id, properties });
  // Rilegge la pagina: la risposta del PATCH non riflette in modo affidabile i rollup
  // (es. Commessa Cliente Info) — stesso motivo per cui updateRitiro rilegge dopo il PATCH.
  const fresh = await notion.pages.retrieve({ page_id: id });
  return pageToCarico(fresh);
}

export async function deleteCarico(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, archived: true });
}

export const getFornitori = unstable_cache(
  async (): Promise<string[]> => {
    const pages = await queryAll(DB_FORNITORI, undefined, [{ property: "Nome", direction: "ascending" }]);
    return pages.map((p) => getText(prop(p, "Nome"))).filter(Boolean);
  },
  ["notion-fornitori"],
  { revalidate: 300, tags: ["fornitori"] }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToOperatore(page: any): Operatore {
  const uniqueId = prop(page, "ID")?.unique_id;
  const matricola = uniqueId ? `${uniqueId.prefix}-${String(uniqueId.number).padStart(4, "0")}` : "";
  return {
    id: page.id,
    matricola,
    cognome: getText(prop(page, "Cognome")),
    nome: getText(prop(page, "Nome")),
    reparto: getText(prop(page, "Reparto")),
    tipo: getText(prop(page, "Tipo")),
    azienda: getText(prop(page, "Azienda")),
    inForza: getCheckbox(prop(page, "In Forza")),
  };
}

// Operatori "in forza" dal database Notion "Personale" — usati da Rilevamento Ore
export const getOperatori = unstable_cache(
  async (): Promise<Operatore[]> => {
    const pages = await queryAll(DB_OPERATORI,
      { property: "In Forza", checkbox: { equals: true } },
      [{ property: "Cognome", direction: "ascending" }]
    );
    return pages.map(pageToOperatore).filter(o => o.matricola);
  },
  ["notion-operatori"],
  { revalidate: 300, tags: ["operatori"] }
);

// Tutti gli operatori del database "Personale", inclusi quelli non più in forza — per la vista
// sola lettura in Parametri Reparto (2026-08-08): serve vedere anche chi è stato disattivato,
// non solo l'elenco attivo già usato da Rilevamento Ore.
export const getTuttiOperatori = unstable_cache(
  async (): Promise<Operatore[]> => {
    const pages = await queryAll(DB_OPERATORI, undefined, [{ property: "Cognome", direction: "ascending" }]);
    return pages.map(pageToOperatore).filter(o => o.matricola);
  },
  ["notion-operatori-tutti"],
  { revalidate: 300, tags: ["operatori"] }
);

const ODP_SPECIALI: { prefix: string; label: string }[] = [
  { prefix: "SET", label: "Setup" },
  { prefix: "MNT", label: "Manutenzione" },
  { prefix: "MEET", label: "Riunione" },
  { prefix: "FORM", label: "Formazione" },
  { prefix: "PUL", label: "Pulizie" },
];

// ODP attivi per l'autocomplete di Rilevamento Ore + codici speciali indiretti.
// Due filtri distinti e deliberatamente diversi (chiariti con l'utente 2026-08-08):
// - Sulla SCHEDA: esclude solo "Annullata" — incluso deliberatamente anche "Completato": un
//   arredo completato può restare in fabbrica in attesa di carico/spedizione, un operatore può
//   ancora doverci segnare ore. Filtrare solo su "In lavorazione" bloccava questo caso reale
//   (prima versione di questa funzione, corretta lo stesso giorno).
// - Sulla COMMESSA collegata: esclude le Schede la cui Commessa è "Chiusa" (negozio consegnato)
//   — quello sì un vero endpoint: da lì in poi, qualunque rilavorazione aprirebbe un nuovo ODP,
//   mai una riapertura del vecchio, quindi il vecchio ODP non serve più nella lista di selezione.
// registraChiusuraOdp/standard_reparto restano comunque scollegati dallo stato Scheda/Commessa
// (vedi PROSSIME_IMPLEMENTAZIONI.md) — qui si tratta solo di cosa proporre nella tendina.
export async function getOdpAttivi(): Promise<OdpAttivo[]> {
  const [schede, commesse] = await Promise.all([getSchede(), getCommesse()]);
  const statoCommessaById = new Map(commesse.map(c => [c.id, c.stato]));

  // dedup per ODP: lo stesso testo ODP può comparire su più Schede quando ci sono
  // sub-item padre/figlio collegati (oggi non lavorabili singolarmente in Rilevamento
  // Ore — se in futuro si vorrà distinguerli, andrà rivista questa dedup) — teniamo
  // la prima occorrenza per evitare key React duplicate
  const vistiOdp = new Set<string>();
  const attivi: OdpAttivo[] = schede
    .filter(s => s.statoProduzione !== "Annullata" && s.odp)
    .filter(s => !s.commessaId || statoCommessaById.get(s.commessaId) !== "Chiusa")
    .filter(s => {
      if (vistiOdp.has(s.odp)) return false;
      vistiOdp.add(s.odp);
      return true;
    })
    .map(s => ({
      id: s.id,
      odp: s.odp,
      label: s.clienteInfo ? `${s.odp} — ${s.clienteInfo}` : s.odp,
      numeroScheda: s.numeroScheda || undefined,
      clienteInfo: s.clienteInfo || undefined,
      codiceArticolo: s.codiceArticolo || undefined,
      isSpeciale: false,
    }));
  const speciali: OdpAttivo[] = ODP_SPECIALI.map(s => ({
    id: null,
    odp: s.prefix,
    label: `${s.prefix} — ${s.label}`,
    isSpeciale: true,
  }));
  return [...attivi, ...speciali];
}

// Risolve il Codice Art. di un ODP per aggiornare standard_reparto ad ogni scrittura di ore
// (vedi standardRepartoRepository.ts) — usa la cache in-memory di getSchede(), quasi sempre
// una lettura da cache, non una vera chiamata Notion ad ogni registrazione. Se l'odp è
// condiviso da più Schede (padre + sottoschede, ognuna col proprio Codice Art.), prende la
// prima trovata — stessa approssimazione già accettata in getOdpAttivi() per lo stesso motivo:
// ore_registrate non distingue su quale sotto-elemento di un ODP ricadano le ore.
export async function getCodiceArticoloPerOdp(odp: string): Promise<string | null> {
  const schede = await getSchede();
  const trovata = schede.find(s => s.odp === odp);
  return trovata?.codiceArticolo || null;
}

export const getFornitoriList = unstable_cache(
  async (): Promise<{ id: string; nome: string; codiceOs1: string }[]> => {
    const pages = await queryAll(DB_FORNITORI, undefined, [{ property: "Nome", direction: "ascending" }]);
    return pages
      .map((p) => ({ id: p.id, nome: getText(prop(p, "Nome")), codiceOs1: getText(prop(p, "Idfornitore")) }))
      .filter((f) => f.nome);
  },
  ["notion-fornitori-list"],
  { revalidate: 300, tags: ["fornitori"] }
);

export const getFornitoriMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const pages = await queryAll(DB_FORNITORI, undefined, [{ property: "Nome", direction: "ascending" }]);
    const map: Record<string, string> = {};
    pages.forEach(p => { map[p.id] = getText(prop(p, "Nome")); });
    return map;
  },
  ["notion-fornitori-map"],
  { revalidate: 300, tags: ["fornitori"] }
);

export async function findFornitoreMatch(name: string, codiceOs1?: string | null): Promise<{ id: string; nome: string; matchType: "exact" | "partial" } | null> {
  const list = await getFornitoriList();

  // Il codice fornitore OS1 è una chiave stabile, immune a cambi di ragione sociale —
  // ha priorità sul match per nome quando presente sia sul fornitore che nella riga importata.
  const needleCode = codiceOs1?.trim();
  if (needleCode) {
    const byCode = list.find((f) => f.codiceOs1 && f.codiceOs1 === needleCode);
    if (byCode) return { id: byCode.id, nome: byCode.nome, matchType: "exact" };
  }

  if (!name) return null;
  const needle = name.trim().toLowerCase();
  const exact = list.find((f) => f.nome.toLowerCase() === needle);
  if (exact) return { ...exact, matchType: "exact" };
  const partial = list.find((f) => f.nome.toLowerCase().includes(needle) || needle.includes(f.nome.toLowerCase()));
  return partial ? { ...partial, matchType: "partial" } : null;
}

export async function findFornitoreIdByName(name: string): Promise<string | null> {
  const match = await findFornitoreMatch(name);
  return match?.id ?? null;
}

export async function updateSchedaStato(pageId: string, stato: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Stato: { select: { name: stato } } },
  });
}

// Ritiro → Fatto: materiale rientrato dal fornitore
// - Stato → "In lavorazione" (ODP torna in produzione interna)
// - Stato Produzione Esterna → "Rientrato"
export async function updateSchedaRientrato(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Stato: { select: { name: "In lavorazione" } },
      "Stato Produzione Esterna": { select: { name: "Rientrato" } },
    },
  });
}

// Ritiro rilavorazione → Fatto: pezzo tornato fisicamente, in attesa di verifica
// - Solo Stato Produzione Esterna → "Rientrato" (Stato resta "In lavorazione Esterna")
// - Il parent rimane "In Attesa Rilavorazione" fino a "Segna Rientrata" manuale
export async function updateRilavorazioneRientrata(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Stato Produzione Esterna": { select: { name: "Rientrato" } },
    },
  });
}

// Consegna → Fatto: materiale consegnato al fornitore, ora in lavorazione
// - Solo Stato Produzione Esterna → "In Lavorazione" (Stato resta "In lavorazione Esterna")
export async function updateSchedaConsegnaFatta(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Stato Produzione Esterna": { select: { name: "In Lavorazione" } },
    },
  });
}

// Scrive SOLO la property "Kit Ferramenta" — dedicata e isolata per non passare
// dal path generico di updateScheda()/SchedaUpdate, pensato per il form di modifica.
export async function updateSchedaKitFerramenta(id: string, stato: "Si" | "No" | null): Promise<Scheda> {
  await notion.pages.update({
    page_id: id,
    properties: { "Kit Ferramenta": stato ? { select: { name: stato } } : { select: null } },
  });
  return getSchedaById(id);
}

// Scrive SOLO la property "Descrizione Kit Ferramenta" (riepilogo testuale, non una relation) —
// la distinta strutturata vive su Postgres (kit_ferramenta_righe), qui resta solo un promemoria
// leggibile per chi guarda la Scheda direttamente su Notion.
export async function updateSchedaKitFerramentaDescrizione(id: string, descrizione: string): Promise<void> {
  await notion.pages.update({
    page_id: id,
    properties: { "Descrizione Kit Ferramenta": { rich_text: [{ text: { content: descrizione } }] } },
  });
}

// getSchede()/getSottoschede() NON usano unstable_cache: il risultato serializzato supera i 2MB
// (~2.8MB su 921+989 righe) e la Data Cache di Next.js scarta silenziosamente (solo un warning nei
// log) qualunque voce sopra quella soglia — di fatto nessuna delle due veniva mai messa in cache,
// ogni richiesta ripartiva da zero verso Notion (~15-20s), sempre, indipendentemente da revalidate.
// Cache in memoria scritta a mano: nessun limite di dimensione, e la Promise condivisa deduplica
// eventuali richieste concorrenti durante il primo popolamento.
let schedeCache: Scheda[] | null = null;
let schedeCachePromise: Promise<Scheda[]> | null = null;

export async function getSchede(): Promise<Scheda[]> {
  if (schedeCache) return schedeCache;
  if (!schedeCachePromise) {
    schedeCachePromise = (async () => {
      const pages = await queryAll(
        DB_SCHEDE,
        { property: "Tipologia", select: { equals: "Scheda" } },
        [{ property: "ODP", direction: "descending" }],
      );
      const result = pages.map(pageToScheda);
      schedeCache = result;
      schedeCachePromise = null;
      return result;
    })().catch((e) => { schedeCachePromise = null; throw e; });
  }
  return schedeCachePromise;
}

// ODP "avviati" (non chiusi) — usata da Kit Ferramenta e Fogli di scarico
export async function getSchedeOdpAvviate(): Promise<Scheda[]> {
  const schede = await getSchede();
  return schede.filter(s => !STATI_CHIUSI_ODP.includes(s.statoProduzione) && !!s.odp);
}

let sottoschedeCache: Scheda[] | null = null;
let sottoschedeCachePromise: Promise<Scheda[]> | null = null;

export async function getSottoschede(): Promise<Scheda[]> {
  if (sottoschedeCache) return sottoschedeCache;
  if (!sottoschedeCachePromise) {
    sottoschedeCachePromise = (async () => {
      const pages = await queryAll(
        DB_SCHEDE,
        { property: "Tipologia", select: { does_not_equal: "Scheda" } },
      );
      const result = pages.map(pageToScheda);
      sottoschedeCache = result;
      sottoschedeCachePromise = null;
      return result;
    })().catch((e) => { sottoschedeCachePromise = null; throw e; });
  }
  return sottoschedeCachePromise;
}

// Invalida la cache "schede" e la ripopola in background (fire-and-forget): il fetch completo
// da Notion (~15-20s su ~1900 righe tra Schede e Sottoschede) lo paga questa chiamata, non il
// prossimo utente che apre la pagina Schede/Rilevamento Ore dopo l'invalidazione.
//
// Il ritardo di 1.5s prima del refetch è deliberato, non un rallentamento a caso: chi chiama
// questa funzione l'ha appena fatto dopo una pages.update() su Notion (es. cambio stato Kit
// Ferramenta) — ripartire la query dell'intero database nello stesso istante rischia di
// catturare uno snapshot non ancora propagato lato Notion (eventual consistency) e mettere in
// cache il valore VECCHIO. Senza TTL su questa cache, quel valore sbagliato resterebbe lì
// indefinitamente, fino alla prossima invalidazione — non basta aspettare, va evitato a monte.
// Verificato empiricamente in sessione 2026-08-06: senza ritardo, il refetch cattura sistematicamente
// lo stato precedente alla scrittura appena fatta.
export function invalidateSchedeCache(): void {
  schedeCache = null;
  sottoschedeCache = null;
  setTimeout(() => {
    void getSchede();
    void getSottoschede();
  }, 1500);
}

export async function getNextRilavorazioneOdp(parentId: string, parentOdp: string): Promise<string> {
  // Query per prefisso ODP — più affidabile del relation filter (che può avere delay di indicizzazione)
  const prefix = `${parentOdp}/R`;
  const pages = await queryAll(DB_SCHEDE, {
    and: [
      { property: "ODP", rich_text: { starts_with: prefix } },
      { property: "Tipologia", select: { equals: "Rilavorazione" } },
    ],
  });
  const maxN = pages.reduce((max, p) => {
    const odp = getText(prop(p, "ODP"));
    const m = odp.match(/\/R(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `${parentOdp}/R${String(maxN + 1).padStart(2, "0")}`;
  // parentId unused but kept in signature for compatibility
  void parentId;
}

export async function getSchedaById(id: string): Promise<Scheda> {
  const page = await notion.pages.retrieve({ page_id: id });
  return pageToScheda(page);
}

export async function updateScheda(id: string, data: SchedaUpdate): Promise<Scheda> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  if (data.statoProduzione !== undefined)
    properties["Stato"] = { select: data.statoProduzione ? { name: data.statoProduzione } : null };
  if (data.dataProduzionePrevista !== undefined)
    properties["Data Produzione Prevista"] = { date: data.dataProduzionePrevista ? { start: data.dataProduzionePrevista } : null };
  if (data.produzioneEsterna !== undefined)
    properties["Produzione Esterna"] = { checkbox: data.produzioneEsterna };
  if (data.statoProdEsterna !== undefined)
    properties["Stato Produzione Esterna"] = { select: data.statoProdEsterna ? { name: data.statoProdEsterna } : null };
  if (data.dataRientroPrevista !== undefined)
    properties["Data Rientro Prevista"] = { date: data.dataRientroPrevista ? { start: data.dataRientroPrevista } : null };
  if (data.dataUscitaMateriale !== undefined)
    properties["Data Uscita Materiale"] = { date: data.dataUscitaMateriale ? { start: data.dataUscitaMateriale } : null };
  if (data.dataRientroEffettiva !== undefined)
    properties["Data Rientro Effettiva"] = { date: data.dataRientroEffettiva ? { start: data.dataRientroEffettiva } : null };
  if (data.note !== undefined)
    properties["Descrizione/Fasi/Piano/Stanza"] = { rich_text: [{ text: { content: data.note } }] };
  if (data.codiceArticolo !== undefined)
    properties["Codice Art."] = { rich_text: [{ text: { content: data.codiceArticolo } }] };
  if (data.posizione !== undefined)
    properties["Posizione"] = { rich_text: [{ text: { content: data.posizione } }] };
  if (data.quantita !== undefined)
    properties["Quantità"] = { number: data.quantita };
  if (data.dataSchedaRicevuta !== undefined)
    properties["Data Scheda Ricevuta"] = { date: data.dataSchedaRicevuta ? { start: data.dataSchedaRicevuta } : null };
  if (data.noteStato !== undefined)
    properties["Note Stato"] = { rich_text: [{ text: { content: data.noteStato } }] };
  // "Nome Fornitore" è una rollup (deriva dalla relation "Fornitore", non scrivibile
  // direttamente) e "Ordine Fornitore" è un campo files (allegato), non testo — verificato
  // sullo schema Notion reale il 2026-08-07. SchedaUpdate espone questi due campi ma qui
  // deliberatamente non vengono scritti: servirebbe un vero selettore Fornitori (relation)
  // per il primo, un upload dedicato per il secondo. Vedi PROSSIME_IMPLEMENTAZIONI.md.

  const page = await notion.pages.update({ page_id: id, properties });
  return pageToScheda(page);
}

// Soft-delete, stesso pattern di deleteRitiro/deleteCarico: la pagina resta recuperabile
// via getSchedaById (usata da Kit Ferramenta/Ritiri/Verifiche che referenziano l'id), sparisce
// solo dalle liste perché databases.query esclude gli archiviati di default.
export async function archiveScheda(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, archived: true });
}

export async function getRitiri(): Promise<Ritiro[]> {
  const [pages, fornitoriMap] = await Promise.all([
    queryAll(DB_RITIRI, undefined, [{ property: "Data Trasporto", direction: "descending" }]),
    getFornitoriMap(),
  ]);
  return pages.map(p => pageToRitiro(p, fornitoriMap));
}

export async function getRitiroById(id: string): Promise<Ritiro> {
  const [page, fornitoriMap] = await Promise.all([
    notion.pages.retrieve({ page_id: id }) as Promise<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    getFornitoriMap(),
  ]);
  return pageToRitiro(page, fornitoriMap);
}

export async function getRitiriByScheda(schedaId: string): Promise<Ritiro[]> {
  const pages = await queryAll(DB_RITIRI, {
    property: "Scheda",
    relation: { contains: schedaId },
  });
  return pages.map(p => pageToRitiro(p));
}

export async function deleteRitiro(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, archived: true });
}

export async function updateRitiro(id: string, data: RitiroUpdate): Promise<Ritiro> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  if (data.causale)
    properties["Descrizione"] = { title: [{ text: { content: data.causale } }] };
  else if (data.descrizioneMerce)
    properties["Descrizione"] = { title: [{ text: { content: data.descrizioneMerce } }] };
  if (data.dataTrasporto !== undefined)
    properties["Data Trasporto"] = { date: data.dataTrasporto ? { start: data.dataTrasporto } : null };
  if (data.tipoMovimento !== undefined)
    properties["Tipo movimento"] = { select: data.tipoMovimento ? { name: data.tipoMovimento } : null };
  if (data.stato) {
    properties["Stato"] = { status: { name: data.stato } };
    if (data.stato === "Fatto") {
      properties["Data Fatto"] = { date: { start: new Date().toISOString() } };
    } else {
      properties["Data Fatto"] = { date: null };
    }
  }
  if (data.urgenza !== undefined)
    properties["Urgenza"] = { select: { name: data.urgenza ? "Si" : "No" } };
  if (data.nc !== undefined)
    properties["NC"] = { checkbox: data.nc };
  if (data.nrCollo !== undefined)
    properties["Nr Collo"] = { number: data.nrCollo ?? null };
  if (data.totColli !== undefined)
    properties["Tot Colli"] = { number: data.totColli ?? null };
  if (data.schedaId !== undefined)
    properties["Scheda"] = data.schedaId
      ? { relation: [{ id: data.schedaId }] }
      : { relation: [] };
  if (data.fornitoreId !== undefined)
    properties["Fornitore"] = data.fornitoreId
      ? { relation: [{ id: data.fornitoreId }] }
      : { relation: [] };
  if (data.commessaId !== undefined)
    properties["Commessa"] = data.commessaId
      ? { relation: [{ id: data.commessaId }] }
      : { relation: [] };
  if (data.rilavorazioneId !== undefined)
    properties["Rilavorazione"] = data.rilavorazioneId
      ? { relation: [{ id: data.rilavorazioneId }] }
      : { relation: [] };

  const [, fornitoriMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getFornitoriMap(),
  ]);
  // Rilegge la pagina: la risposta del PATCH non include i rollup (PDF Scheda, ODP, ecc.)
  const fresh = await notion.pages.retrieve({ page_id: id });
  return pageToRitiro(fresh, fornitoriMap);
}

export const getCommesse = unstable_cache(
  async (): Promise<Commessa[]> => {
    const pages = await queryAll(DB_COMMESSE, undefined, [
      { property: "Numero Commessa", direction: "descending" },
    ]);
    return pages.map(pageToCommessa);
  },
  ["notion-commesse"],
  { revalidate: 300, tags: ["commesse"] }
);

export async function getCommessaById(id: string): Promise<Commessa> {
  const page = await notion.pages.retrieve({ page_id: id });
  return pageToCommessa(page);
}

export async function getAreeByCommessa(commessaId: string): Promise<Area[]> {
  const pages = await queryAll(DB_AREE, {
    property: "Commessa",
    relation: { contains: commessaId },
  });
  return pages.map(pageToArea);
}

export async function getSchedeByArea(areaId: string): Promise<Scheda[]> {
  const pages = await queryAll(DB_SCHEDE, {
    and: [
      { property: "Area-Cartella Commessa", relation: { contains: areaId } },
      { property: "Tipologia", select: { equals: "Scheda" } },
    ],
  });
  return pages.map(pageToScheda);
}

export async function getSchedeByCommessa(commessaId: string): Promise<Scheda[]> {
  const pages = await queryAll(DB_SCHEDE, {
    and: [
      { property: "Commessa Nr", relation: { contains: commessaId } },
      { property: "Tipologia", select: { equals: "Scheda" } },
    ],
  });
  return pages.map(pageToScheda);
}

const NOTION_VERSION = "2022-06-28";

export async function getNextOdp(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(2);
  const prefix = `MP${year}-`;
  const pages = await queryAll(
    DB_SCHEDE,
    { property: "Tipologia", select: { equals: "Scheda" } },
    undefined,
    5,
  );
  let maxNum = 0;
  for (const p of pages) {
    const odp = getText(prop(p, "ODP"));
    if (odp.startsWith(prefix)) {
      const num = parseInt(odp.slice(prefix.length));
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export async function findCommessaByNumber(numero: string): Promise<Commessa | null> {
  const all = await getCommesse();
  return all.find((c) => c.numeroCommessa === numero) ?? null;
}

export async function uploadFileToNotionRaw(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const token = process.env.NOTION_TOKEN!;
  const createRes = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "single_part" }),
  });
  if (!createRes.ok) throw new Error(`file_upload create: ${createRes.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id: uploadId } = await createRes.json() as any;

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const fd = new FormData();
  fd.append("file", new Blob([arrayBuffer], { type: mimeType }), filename);
  const sendRes = await fetch(`https://api.notion.com/v1/file_uploads/${uploadId}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    body: fd,
  });
  if (!sendRes.ok) throw new Error(`file_upload send: ${sendRes.status}`);
  return uploadId;
}

export async function createSchedaPage({
  numeroScheda,
  commessaId,
  odp,
  tipologia = "Scheda",
  stato,
  codiceArticolo,
  posizione,
  fornitore,
  fornitoreId,
  quantita,
  dataProduzionePrevista,
  dataSchedaRicevuta,
  produzioneEsterna,
  dataRientroPrevista,
  note,
  parentId,
  pdfBuffer,
  pdfFilename,
  thumbnailBuffer,
  thumbnailFilename,
}: {
  numeroScheda: string;
  commessaId: string | null;
  odp: string;
  tipologia?: string;
  stato?: string;
  codiceArticolo?: string | null;
  posizione?: string | null;
  fornitore?: string | null;
  fornitoreId?: string | null;
  quantita?: number | null;
  dataProduzionePrevista?: string | null;
  dataSchedaRicevuta?: string | null;
  produzioneEsterna?: boolean;
  dataRientroPrevista?: string | null;
  note?: string | null;
  parentId?: string | null;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
  thumbnailBuffer?: Buffer;
  thumbnailFilename?: string;
}): Promise<Scheda> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Numero Scheda": { title: [{ text: { content: numeroScheda } }] },
    "Tipologia": { select: { name: tipologia } },
  };
  if (commessaId) properties["Commessa Nr"] = { relation: [{ id: commessaId }] };

  if (stato) properties["Stato"] = { select: { name: stato } };

  if (odp) properties["ODP"] = { rich_text: [{ text: { content: odp } }] };
  if (codiceArticolo) properties["Codice Art."] = { rich_text: [{ text: { content: codiceArticolo } }] };
  if (posizione) properties["Posizione"] = { rich_text: [{ text: { content: posizione } }] };
  if (fornitore) properties["Nome Fornitore"] = { rich_text: [{ text: { content: fornitore } }] };
  if (fornitoreId) properties["Fornitore"] = { relation: [{ id: fornitoreId }] };
  if (note) properties["Descrizione/Fasi/Piano/Stanza"] = { rich_text: [{ text: { content: note } }] };
  if (quantita != null) properties["Quantità"] = { number: quantita };
  if (dataProduzionePrevista) properties["Data Produzione Prevista"] = { date: { start: dataProduzionePrevista } };
  if (dataSchedaRicevuta) properties["Data Scheda Ricevuta"] = { date: { start: dataSchedaRicevuta } };
  if (produzioneEsterna != null) properties["Produzione Esterna"] = { checkbox: produzioneEsterna };
  if (dataRientroPrevista) properties["Data Rientro Prevista"] = { date: { start: dataRientroPrevista } };
  if (parentId) properties["Parent item"] = { relation: [{ id: parentId }] };

  if (pdfBuffer && pdfFilename) {
    const uploadId = await uploadFileToNotionRaw(pdfBuffer, pdfFilename, "application/pdf");
    properties["PDF Allegato"] = { files: [{ type: "file_upload", name: pdfFilename, file_upload: { id: uploadId } }] };
  }
  if (thumbnailBuffer && thumbnailFilename) {
    const uploadId = await uploadFileToNotionRaw(thumbnailBuffer, thumbnailFilename, "image/png");
    properties["Copertina"] = { files: [{ type: "file_upload", name: thumbnailFilename, file_upload: { id: uploadId } }] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({ parent: { database_id: DB_SCHEDE }, properties }) as any;
  return pageToScheda(page);
}

export async function appendFotoToPage(pageId: string, fotoBase64Array: string[]): Promise<void> {
  if (!fotoBase64Array.length) return;
  const token = process.env.NOTION_TOKEN!;
  const uploadIds: { id: string; name: string }[] = [];

  for (let i = 0; i < fotoBase64Array.length; i++) {
    const base64 = fotoBase64Array[i];
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const mimeType = match[1];
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const fileName = `foto_${Date.now()}_${i}.${ext}`;
    const raw = Buffer.from(match[2], "base64");
    const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    const createRes = await fetch("https://api.notion.com/v1/file_uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "single_part" }),
    });
    if (!createRes.ok) throw new Error(`file_upload create: ${createRes.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { id: uploadId } = await createRes.json() as any;

    const fd = new FormData();
    fd.append("file", new Blob([arrayBuffer], { type: mimeType }), fileName);
    const sendRes = await fetch(`https://api.notion.com/v1/file_uploads/${uploadId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
      body: fd,
    });
    if (!sendRes.ok) throw new Error(`file_upload send: ${sendRes.status}`);
    uploadIds.push({ id: uploadId, name: fileName });
  }

  if (!uploadIds.length) return;

  // Leggi le foto esistenti e fai append
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
  });
  if (!pageRes.ok) throw new Error(`get page: ${pageRes.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await pageRes.json() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (page.properties?.["Foto"]?.files ?? []).map((f: any) => (
    f.type === "external"
      ? { type: "external", name: f.name, external: { url: f.external.url } }
      : { type: "file", name: f.name, file: { url: f.file.url } }
  ));

  const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: {
        Foto: { files: [...existing, ...uploadIds.map(u => ({ type: "file_upload", name: u.name, file_upload: { id: u.id } }))] },
      },
    }),
  });
  if (!updateRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = await updateRes.json().catch(() => ({})) as any;
    throw new Error(err.message ?? `update page: ${updateRes.status}`);
  }
}

function decodeBase64File(base64: string): { buffer: Buffer; mimeType: string } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("File non valido");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

// Aggiunge un PDF alla property "PDF Allegato" di una Scheda senza rimuovere quelli già presenti
// — stesso spirito di appendFotoToPage, ma per un singolo file alla volta invocato dal modal di modifica.
export async function appendPdfAllegatoToScheda(schedaId: string, pdfBase64: string, filename: string): Promise<void> {
  const { buffer } = decodeBase64File(pdfBase64);
  const uploadId = await uploadFileToNotionRaw(buffer, filename, "application/pdf");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.retrieve({ page_id: schedaId }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (page.properties?.["PDF Allegato"]?.files ?? []).map((f: any) => (
    f.type === "external"
      ? { type: "external", name: f.name, external: { url: f.external.url } }
      : { type: "file", name: f.name, file: { url: f.file.url } }
  ));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "PDF Allegato": { files: [...existing, { type: "file_upload", name: filename, file_upload: { id: uploadId } }] },
  };
  await notion.pages.update({ page_id: schedaId, properties });
}

// Sostituisce (non aggiunge) la Copertina — è un'immagine di anteprima singola, non un elenco.
export async function updateCopertinaScheda(schedaId: string, imageBase64: string, filename: string): Promise<void> {
  const { buffer, mimeType } = decodeBase64File(imageBase64);
  const uploadId = await uploadFileToNotionRaw(buffer, filename, mimeType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Copertina": { files: [{ type: "file_upload", name: filename, file_upload: { id: uploadId } }] },
  };
  await notion.pages.update({ page_id: schedaId, properties });
}

