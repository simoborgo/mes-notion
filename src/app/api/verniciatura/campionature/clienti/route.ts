import { NextResponse } from "next/server";
import { CLIENTI_VERNICIATURA } from "@/lib/types";

// Sorgente unica di verità per il dropdown cliente lato frontend.
export async function GET() {
  return NextResponse.json(CLIENTI_VERNICIATURA);
}
