import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

interface NotionPage {
  id: string;
  properties: {
    ODP?: { rich_text: Array<{ plain_text: string }> };
    "Numero Scheda"?: { title: Array<{ plain_text: string }> };
    "Parent item"?: { relation: Array<{ id: string }> };
    "Cliente Info"?: { rich_text: Array<{ plain_text: string }> };
    "Tipologia"?: { select: { name: string } | null };
    "Stato Produzione Esterna"?: { select: { name: string } | null };
    "Stato"?: { status: { name: string } | null };
    "Commessa Nr"?: { rollup: { array: Array<{ title: Array<{ plain_text: string }> }> } | null };
  };
}

export interface OdpEntry {
  id: string; // Notion page_id — chiave univoca usata per il routing
  odp: string;
  label: string;
  isChild: boolean;
  clienteInfo: string;
  tipologia: string;
  statoProdEsterna: string;
  statoProduzione: string;
  commessaNr: string;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });

  const dbId = process.env.NOTION_DB_SCHEDE!;
  const token = process.env.NOTION_TOKEN!;

  const entries: OdpEntry[] = [];
  let cursor: string | undefined;

  try {
    do {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json() as {
        results?: NotionPage[];
        has_more?: boolean;
        next_cursor?: string | null;
        message?: string;
      };

      if (!data.results) {
        console.error("[odp-list] Notion error:", data.message);
        break;
      }

      for (const page of data.results) {
        const odp = page.properties.ODP?.rich_text?.[0]?.plain_text?.trim();
        if (!odp || !/^MP\d{2}-\d{3}$/i.test(odp)) continue;

        const numero = page.properties["Numero Scheda"]?.title?.[0]?.plain_text?.trim() ?? "";
        const isChild = (page.properties["Parent item"]?.relation?.length ?? 0) > 0;
        const clienteInfo = page.properties["Cliente Info"]?.rich_text?.[0]?.plain_text?.trim() ?? "";
        const tipologia = page.properties["Tipologia"]?.select?.name ?? "";
        const statoProdEsterna = page.properties["Stato Produzione Esterna"]?.select?.name ?? "";
        const statoProduzione = page.properties["Stato"]?.status?.name ?? "";
        const commessaNr = page.properties["Commessa Nr"]?.rollup?.array?.[0]?.title?.[0]?.plain_text ?? "";

        entries.push({ id: page.id, odp: odp.toUpperCase(), label: numero, isChild, clienteInfo, tipologia, statoProdEsterna, statoProduzione, commessaNr });
      }

      cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
    } while (cursor);

    entries.sort((a, b) => {
      if (a.isChild !== b.isChild) return a.isChild ? 1 : -1;
      return a.odp.localeCompare(b.odp);
    });

    return NextResponse.json({ ok: true, entries });
  } catch (err) {
    console.error("[odp-list]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
