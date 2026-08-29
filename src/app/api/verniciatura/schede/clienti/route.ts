import { NextResponse } from "next/server";
import { getClientiVerniciatura } from "@/lib/clientiVerniciaturaRepository";

// Sorgente unica di verità per il dropdown cliente lato frontend.
export async function GET() {
  const clienti = await getClientiVerniciatura();
  return NextResponse.json(clienti);
}
