import { Client } from "@notionhq/client";
import type { Scheda, SchedaUpdate, Ritiro, RitiroUpdate, Commessa, Area } from "./types";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB_SCHEDE = process.env.NOTION_DB_SCHEDE!;
const DB_COMMESSE = process.env.NOTION_DB_COMMESSE!;
const DB_AREE = process.env.NOTION_DB_AREE!;
const DB_RITIRI = process.env.NOTION_DB_RITIRI!;

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
  if (!p || p.type !== "files") return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (p.files ?? []).map((f: any) => ({
    name: f.name,
    url: f.type === "external" ? f.external?.url : f.file?.url ?? "",
  }));
}

function getRelationId(p: ReturnType<typeof prop>): string | null {
  if (!p || p.type !== "relation") return null;
  return p.relation?.[0]?.id ?? null;
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
    faseCorrente: getText(prop(page, "Fase corrente")),
    dataSchedaRicevuta: getDate(prop(page, "Data Scheda Ricevuta")),
    dataProduzionePrevista: getDate(prop(page, "Data Produzione Prevista")),
    pdfAllegato: getFiles(prop(page, "PDF Allegato")),
    produzioneEsterna: getCheckbox(prop(page, "Produzione Esterna")),
    statoProdEsterna: getText(prop(page, "Stato Produzione Esterna")),
    fornitore: getText(prop(page, "Nome Fornitore")),
    ordineFornitore: getText(prop(page, "Ordine Fornitore")),
    dataRientroPrevista: getDate(prop(page, "Data Rientro Prevista")),
    dataUscitaMateriale: getDate(prop(page, "Data Uscita Materiale")),
    dataRientroEffettiva: getDate(prop(page, "Data Rientro Effettiva")),
    copertina: getFiles(prop(page, "Copertina"))[0]?.url ?? null,
    note: getText(prop(page, "Note")),
    commessaId: getRelationId(prop(page, "Commessa Nr")),
    commessaNr: extractCommessaNr(clienteInfo),
    areaId: getRelationId(prop(page, "Area-Cartella Commessa")),
    areaLabel: getText(prop(page, "Area-Cartella Commessa")),
    parentId: getRelationId(prop(page, "Parent item")),
    notionUrl: notionUrl(page.id),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToRitiro(page: any): Ritiro {
  return {
    id: page.id,
    causale: getText(prop(page, "Causale")),
    numeroOrdine: getText(prop(page, "Numero d'ordine")),
    numeroOrdineId: getRelationId(prop(page, "Numero d'ordine")),
    descrizioneMerce: getText(prop(page, "Descrizione merce")),
    dataTrasporto: getDate(prop(page, "Data Trasporto")),
    tipoMovimento: getText(prop(page, "Tipo movimento")),
    stato: getText(prop(page, "Stato")),
    urgenza: getCheckbox(prop(page, "Urgenza")),
    fornitore: getText(prop(page, "Fornitore")),
    note: getText(prop(page, "Note")),
    documentiAllegati: getFiles(prop(page, "Documenti allegati")),
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

export async function getSchede(): Promise<Scheda[]> {
  const pages = await queryAll(
    DB_SCHEDE,
    { property: "Tipologia", select: { equals: "Scheda" } },
    [{ property: "ODP", direction: "descending" }],
  );
  return pages.map(pageToScheda);
}

export async function getSottoschede(): Promise<Scheda[]> {
  const pages = await queryAll(
    DB_SCHEDE,
    { property: "Tipologia", select: { equals: "Sottoscheda" } },
  );
  return pages.map(pageToScheda);
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
    properties["Note"] = { rich_text: [{ text: { content: data.note } }] };

  const page = await notion.pages.update({ page_id: id, properties });
  return pageToScheda(page);
}

export async function getRitiri(): Promise<Ritiro[]> {
  const pages = await queryAll(DB_RITIRI, undefined, [
    { property: "Data Trasporto", direction: "descending" },
  ]);
  return pages.map(pageToRitiro);
}

export async function updateRitiro(id: string, data: RitiroUpdate): Promise<Ritiro> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  if (data.causale !== undefined)
    properties["Causale"] = { rich_text: [{ text: { content: data.causale } }] };
  if (data.descrizioneMerce !== undefined)
    properties["Descrizione merce"] = { rich_text: [{ text: { content: data.descrizioneMerce } }] };
  if (data.dataTrasporto !== undefined)
    properties["Data Trasporto"] = { date: data.dataTrasporto ? { start: data.dataTrasporto } : null };
  if (data.tipoMovimento !== undefined)
    properties["Tipo movimento"] = { select: data.tipoMovimento ? { name: data.tipoMovimento } : null };
  if (data.stato !== undefined)
    properties["Stato"] = { select: data.stato ? { name: data.stato } : null };
  if (data.urgenza !== undefined)
    properties["Urgenza"] = { checkbox: data.urgenza };
  if (data.fornitore !== undefined)
    properties["Fornitore"] = { rich_text: [{ text: { content: data.fornitore } }] };
  if (data.note !== undefined)
    properties["Note"] = { rich_text: [{ text: { content: data.note } }] };

  const page = await notion.pages.update({ page_id: id, properties });
  return pageToRitiro(page);
}

export async function getCommesse(): Promise<Commessa[]> {
  const pages = await queryAll(DB_COMMESSE, undefined, [
    { property: "Numero Commessa", direction: "descending" },
  ]);
  return pages.map(pageToCommessa);
}

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
