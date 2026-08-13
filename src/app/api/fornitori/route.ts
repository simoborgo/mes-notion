import { NextResponse } from "next/server";
import { getFornitoriList } from "@/lib/fornitoriRepository";

export async function GET() {
  const list = await getFornitoriList();
  return NextResponse.json(list);
}
