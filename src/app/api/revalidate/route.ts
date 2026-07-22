import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest } from "@/lib/auth";

const PATH_MAP: Record<string, string> = {
  ritiri: "/ritiri",
  schede: "/schede",
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { tag } = await req.json() as { tag?: string };
    const path = PATH_MAP[tag ?? "ritiri"] ?? "/ritiri";
    revalidatePath(path);

    return NextResponse.json({ ok: true, path });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
