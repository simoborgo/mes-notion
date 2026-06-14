import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  console.log("[auth] password ricevuta:", password);
  console.log("[auth] APP_PASSWORD impostata:", !!process.env.APP_PASSWORD);
  console.log("[auth] match:", password === process.env.APP_PASSWORD);

  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    console.log("[auth] login fallita");
    return NextResponse.json({ error: "Password errata" }, { status: 401 });
  }

  console.log("[auth] login ok, set cookie");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mes_session", "authenticated", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 giorni
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mes_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
