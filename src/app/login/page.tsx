"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        setError("Password errata");
      }
    } catch {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-lg p-8 flex flex-col gap-6"
        style={{ background: "white", border: "1px solid #e5e4e0" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ background: "#000", width: 56, height: 56 }}
          >
            <Image src="/modar-logo.png" alt="Modar" width={44} height={44} />
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tracking-tight" style={{ color: "var(--color-black)" }}>
              MES DASHBOARD
            </div>
            <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
              Accesso riservato
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-xs font-medium"
              style={{ color: "var(--color-grey-mid)" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="rounded-md px-3 py-2 text-sm outline-none transition-all"
              style={{
                border: error ? "1.5px solid #991B1B" : "1.5px solid #e5e4e0",
                color: "var(--color-black)",
                background: "#faf9f7",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.target.style.borderColor = error ? "#991B1B" : "#e5e4e0")}
            />
            {error && (
              <span className="text-xs" style={{ color: "#991B1B" }}>
                {error}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="mt-1 rounded-md py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-primary)", color: "white" }}
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      </div>
    </div>
  );
}
