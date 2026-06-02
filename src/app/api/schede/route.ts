import { NextResponse } from "next/server";
import { getSchede } from "@/lib/notion";

export async function GET() {
  try {
    const schede = await getSchede();
    return NextResponse.json(schede);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero schede" }, { status: 500 });
  }
}
