import { Client } from "@notionhq/client";

// DB_AUDIT è opzionale: se non configurato, il log va solo in console.
// Per crearlo su Notion: database con proprietà Title="Operatore" (title),
// "Azione" (rich_text), "ID Risorsa" (rich_text), "Modifiche" (rich_text),
// "Timestamp" (date).
const notion = new Client({ auth: process.env.NOTION_TOKEN, fetch: globalThis.fetch });
const DB_AUDIT = process.env.NOTION_DB_AUDIT;

export type ResourceType = "ritiro" | "scheda" | "carico" | "commessa";
export type ActionType = "CREATE" | "UPDATE" | "DELETE" | "UPLOAD_FOTO";

export interface AuditEntry {
  id: string;
  operatore: string;
  azione: string;
  idRisorsa: string;
  modifiche: string;
  timestamp: string | null;
}

/**
 * Registra un'operazione di modifica nell'audit log.
 * La chiamata va fatta senza await (fire-and-forget) nei route handler
 * per non aggiungere latenza alla risposta HTTP.
 *
 * @example
 * void logOperation(session.name, "UPDATE", "ritiro", id, changes);
 */
export async function logOperation(
  operatorName: string,
  action: ActionType,
  resourceType: ResourceType,
  resourceId: string,
  changes: Record<string, unknown>
): Promise<void> {
  console.log(
    `[audit] ${operatorName} | ${action} ${resourceType}/${resourceId} |`,
    JSON.stringify(changes)
  );

  if (!DB_AUDIT) return;

  // Notion rich_text ha limite di 2000 caratteri per blocco
  const changesStr = JSON.stringify(changes).slice(0, 2000);

  try {
    await notion.pages.create({
      parent: { database_id: DB_AUDIT },
      properties: {
        Operatore: { title: [{ text: { content: operatorName } }] },
        Azione: { rich_text: [{ text: { content: `${action} ${resourceType}` } }] },
        "ID Risorsa": { rich_text: [{ text: { content: resourceId } }] },
        Modifiche: { rich_text: [{ text: { content: changesStr } }] },
        Timestamp: { date: { start: new Date().toISOString() } },
      },
    });
  } catch (e) {
    console.error("[audit] write failed:", e instanceof Error ? e.message : String(e));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToAuditEntry(page: any): AuditEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (page.properties ?? {}) as Record<string, any>;

  function getText(p: unknown): string {
    if (!p || typeof p !== "object") return "";
    const prop = p as Record<string, unknown>;
    if (prop.type === "title")
      return ((prop.title as Array<{ plain_text: string }>) ?? [])
        .map((t) => t.plain_text)
        .join("");
    if (prop.type === "rich_text")
      return ((prop.rich_text as Array<{ plain_text: string }>) ?? [])
        .map((t) => t.plain_text)
        .join("");
    return "";
  }

  function getDate(p: unknown): string | null {
    if (!p || typeof p !== "object") return null;
    const prop = p as Record<string, unknown>;
    if (prop.type !== "date") return null;
    const d = prop.date as { start?: string } | null;
    return d?.start ?? null;
  }

  return {
    id: page.id as string,
    operatore: getText(props["Operatore"]),
    azione: getText(props["Azione"]),
    idRisorsa: getText(props["ID Risorsa"]),
    modifiche: getText(props["Modifiche"]),
    timestamp: getDate(props["Timestamp"]),
  };
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  if (!DB_AUDIT) return [];
  try {
    const res = await notion.databases.query({
      database_id: DB_AUDIT,
      sorts: [{ property: "Timestamp", direction: "descending" }],
      page_size: limit,
    });
    return res.results.map(pageToAuditEntry);
  } catch (e) {
    console.error("[audit] getAuditLog failed:", e instanceof Error ? e.message : String(e));
    return [];
  }
}
