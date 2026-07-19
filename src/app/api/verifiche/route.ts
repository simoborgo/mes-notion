import { NextResponse } from "next/server";
import { repo } from "@/lib/verificheServices";

export async function GET() {
  try {
    const [inVerifica, verificate] = await Promise.all([
      repo.listInSospeso(),
      repo.listVerificate(),
    ]);
    return NextResponse.json({ ok: true, inVerifica, verificate });
  } catch (err) {
    console.error("[verifiche GET]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
