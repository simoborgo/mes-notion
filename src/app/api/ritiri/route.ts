import { NextResponse } from "next/server";
import { getRitiri } from "@/lib/notion";

export async function GET() {
  try {
    const ritiri = await getRitiri();
    return NextResponse.json(ritiri);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero ritiri" }, { status: 500 });
  }
}
