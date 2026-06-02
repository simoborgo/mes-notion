import { NextResponse } from "next/server";
import { getCommesse } from "@/lib/notion";

export async function GET() {
  try {
    const commesse = await getCommesse();
    return NextResponse.json(commesse);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero commesse" }, { status: 500 });
  }
}
