"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("");
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
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (res.ok) {
        window.location.replace("/");
      } else {
        setError(body.error || "Credenziali errate");
        setLoading(false);
      }
    } catch (err) {
      console.error("[login] errore fetch:", err);
      setError("Errore di connessione");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--color-offwhite)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-lg p-8 flex flex-col gap-6"
        style={{ background: "white", border: "1px solid #e5e4e0" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <Image src="/modar-logo.png" alt="Modar" width={200} height={200} style={{ objectFit: "contain" }} />
          <div className="text-center">
            <div className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-black)" }}>
              MES DASHBOARD
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
              Accesso riservato
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nome.cognome"
              required
              autoComplete="username"
              className="login-input rounded-md px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="login-input rounded-md px-3 py-2 text-sm outline-none"
            />
            {error && (
              <span className="text-xs" style={{ color: "#991B1B" }}>{error}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="mt-1 rounded-md py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-primary)", color: "white" }}
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      </div>
    </div>
  );
}
