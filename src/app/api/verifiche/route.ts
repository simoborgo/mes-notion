import { NextResponse } from "next/server";
import { repo } from "@/lib/verificheServices";

export async function GET() {
  try {
    const list = await repo.listInSospeso();
    return NextResponse.json({ ok: true, list });
  } catch (err) {
    console.error("[verifiche GET]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
