import { Client } from "@notionhq/client";
import { unstable_cache } from "next/cache";
import type { Scheda, SchedaUpdate, Ritiro, RitiroUpdate, Commessa, Area, Carico } from "./types";

const notion = new Client({ auth: process.env.NOTION_TOKEN, fetch: globalThis.fetch });

const DB_SCHEDE = process.env.NOTION_DB_SCHEDE!;
const DB_COMMESSE = process.env.NOTION_DB_COMMESSE!;
const DB_AREE = process.env.NOTION_DB_AREE!;
const DB_RITIRI = process.env.NOTION_DB_RITIRI!;
const DB_CARICHI = process.env.NOTION_DB_CARICHI!;
const DB_FORNITORI = process.env.NOTION_DB_FORNITORI!;

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
async function queryAll(dbId: string, filter?: any, sorts?: any[], maxPages = 5): Promise<any[]> {
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
  if (schedaId) properties["Scheda"] = { relation: [{ id: schedaId }] };
  if (fornitoreId) properties["Fornitore"] = { relation: [{ id: fornitoreId }] };
  if (rilavorazioneId) properties["Rilavorazione"] = { relation: [{ id: rilavorazioneId }] };
  if (commessaId) properties["Commessa"] = { relation: [{ id: commessaId }] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({ parent: { database_id: DB_RITIRI }, properties }) as any;
  return pageToRitiro(page);
}

export async function createCarico({
  titolo,
  dataCarico,
  commessaId,
  odpId,
  modalita,
}: {
  titolo: string;
  dataCarico: string;
  commessaId?: string | null;
  odpId?: string | null;
  modalita?: string;
}): Promise<Carico> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Titolo: { title: [{ text: { content: titolo || "Carico" } }] },
    "Data Carico": { date: { start: dataCarico } },
    Stato: { status: { name: "Pianificato" } },
  };
  if (commessaId) properties["Commessa"] = { relation: [{ id: commessaId }] };
  if (odpId) properties["ODP"] = { relation: [{ id: odpId }] };
  if (modalita) properties["Modalità"] = { select: { name: modalita } };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({ parent: { database_id: DB_CARICHI }, properties }) as any;
  return pageToCarico(page);
}

export const getFornitori = unstable_cache(
  async (): Promise<string[]> => {
    const pages = await queryAll(DB_FORNITORI, undefined, [{ property: "Nome", direction: "ascending" }]);
    return pages.map((p) => getText(prop(p, "Nome"))).filter(Boolean);
  },
  ["notion-fornitori"],
  { revalidate: 300, tags: ["fornitori"] }
);

export const getFornitoriList = unstable_cache(
  async (): Promise<{ id: string; nome: string }[]> => {
    const pages = await queryAll(DB_FORNITORI, undefined, [{ property: "Nome", direction: "ascending" }]);
    return pages.map((p) => ({ id: p.id, nome: getText(prop(p, "Nome")) })).filter((f) => f.nome);
  },
  ["notion-fornitori-list"],
  { revalidate: 300, tags: ["fornitori"] }
);

const getFornitoriMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const pages = await queryAll(DB_FORNITORI, undefined, [{ property: "Nome", direction: "ascending" }]);
    const map: Record<string, string> = {};
    pages.forEach(p => { map[p.id] = getText(prop(p, "Nome")); });
    return map;
  },
  ["notion-fornitori-map"],
  { revalidate: 300, tags: ["fornitori"] }
);

export async function findFornitoreIdByName(name: string): Promise<string | null> {
  if (!name) return null;
  const list = await getFornitoriList();
  const needle = name.trim().toLowerCase();
  const exact = list.find((f) => f.nome.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = list.find((f) => f.nome.toLowerCase().includes(needle) || needle.includes(f.nome.toLowerCase()));
  return partial?.id ?? null;
}

export async function updateSchedaStato(pageId: string, stato: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Stato: { select: { name: stato } } },
  });
}

// Ritiro → Fatto: materiale rientrato dal fornitore
// - Stato → "In Lavorazione" (ODP torna in produzione interna)
// - Stato Produzione Esterna → "Rientrato"
export async function updateSchedaRientrato(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Stato: { select: { name: "In Lavorazione" } },
      "Stato Produzione Esterna": { select: { name: "Rientrato" } },
    },
  });
}

// Ritiro rilavorazione → Fatto: pezzo tornato fisicamente, in attesa di verifica
// - Solo Stato Produzione Esterna → "Rientrato" (Stato resta "In Lavorazione Esterna")
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
// - Solo Stato Produzione Esterna → "In Lavorazione" (Stato resta "In Lavorazione Esterna")
export async function updateSchedaConsegnaFatta(pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Stato Produzione Esterna": { select: { name: "In Lavorazione" } },
    },
  });
}

export const getSchede = unstable_cache(
  async (): Promise<Scheda[]> => {
    const pages = await queryAll(
      DB_SCHEDE,
      { property: "Tipologia", select: { equals: "Scheda" } },
      [{ property: "ODP", direction: "descending" }],
    );
    return pages.map(pageToScheda);
  },
  ["notion-schede"],
  { revalidate: 120, tags: ["schede"] }
);

export const getSottoschede = unstable_cache(
  async (): Promise<Scheda[]> => {
    const pages = await queryAll(
      DB_SCHEDE,
      { property: "Tipologia", select: { does_not_equal: "Scheda" } },
    );
    return pages.map(pageToScheda);
  },
  ["notion-sottoschede"],
  { revalidate: 120, tags: ["schede"] }
);

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
    properties["Stato Produzione"] = { select: data.statoProduzione ? { name: data.statoProduzione } : null };
  if (data.dataProduzionePrevista !== undefined)
    properties["Data Produzione Prevista"] = { date: data.dataProduzionePrevista ? { start: data.dataProduzionePrevista } : null };
  if (data.produzioneEsterna !== undefined)
    properties["Produzione Esterna"] = { checkbox: data.produzioneEsterna };
  if (data.statoProdEsterna !== undefined)
    properties["Stato Produzione Esterna"] = { select: data.statoProdEsterna ? { name: data.statoProdEsterna } : null };
  if (data.fornitore !== undefined)
    properties["Fornitore"] = { rich_text: [{ text: { content: data.fornitore } }] };
  if (data.ordineFornitore !== undefined)
    properties["Ordine Fornitore"] = { rich_text: [{ text: { content: data.ordineFornitore } }] };
  if (data.dataRientroPrevista !== undefined)
    properties["Data Rientro Prevista"] = { date: data.dataRientroPrevista ? { start: data.dataRientroPrevista } : null };
  if (data.dataUscitaMateriale !== undefined)
    properties["Data Uscita Materiale"] = { date: data.dataUscitaMateriale ? { start: data.dataUscitaMateriale } : null };
  if (data.dataRientroEffettiva !== undefined)
    properties["Data Rientro Effettiva"] = { date: data.dataRientroEffettiva ? { start: data.dataRientroEffettiva } : null };
  if (data.note !== undefined)
    properties["Descrizione/Fasi/Piano/Stanza"] = { rich_text: [{ text: { content: data.note } }] };

  const page = await notion.pages.update({ page_id: id, properties });
  return pageToScheda(page);
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
