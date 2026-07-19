import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN, fetch: globalThis.fetch });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const prop = req.nextUrl.searchParams.get("prop") ?? "";
  const index = parseInt(req.nextUrl.searchParams.get("index") ?? "0", 10);
  const asJson = req.nextUrl.searchParams.get("json") === "1";

  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = (page as any).properties?.[prop];
    if (!property || property.type !== "files") {
      return NextResponse.json({ error: "File non trovato" }, { status: 404 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = property.files?.[index] as any;
    if (!file) return NextResponse.json({ error: "Indice fuori range" }, { status: 404 });

    const url: string = file.type === "external" ? file.external?.url : file.file?.url;
    if (!url) return NextResponse.json({ error: "URL non disponibile" }, { status: 404 });

    if (asJson) {
      return NextResponse.json({ url }, {
        headers: { "Cache-Control": "private, max-age=3300" },
      });
    }

    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "private, max-age=3300" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore recupero file" }, { status: 500 });
  }
}
