"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Operatore, OdpAttivo } from "@/lib/types";
import OdpSelettore from "./OdpSelettore";

interface OperatoreLoggato {
  matricola: string;
  cognome: string;
  nome: string;
  reparto: string;
  azienda: string;
}

interface SegmentoChiuso {
  id: string;
  odp: string;
  iniziatoAlle: string;
  chiusoAlle: string | null;
  ore: number | null;
  rif: boolean;
}

interface SegmentoAperto {
  id: string;
  odp: string;
  iniziatoAlle: string;
  rif: boolean;
}

const STORAGE_KEY = "mes_operatore_tablet";

function fmtOra(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function OperatoreTablet() {
  const [operatore, setOperatore] = useState<OperatoreLoggato | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setOperatore(JSON.parse(raw)); } catch { /* ignora storage corrotto */ }
    }
    setPronto(true);
  }, []);

  function handleLogin(op: OperatoreLoggato) {
    setOperatore(op);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(op));
  }

  function handleCambiaOperatore() {
    setOperatore(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-4 py-8" style={{ background: "var(--color-offwhite)" }}>
      <div className="w-full max-w-md md:max-w-2xl">
        {!pronto ? null : operatore ? (
          <SchermataLavoro operatore={operatore} onCambiaOperatore={handleCambiaOperatore} />
        ) : (
          <SelettoreOperatore onOk={handleLogin} />
        )}
      </div>
    </div>
  );
}

function Tastierino({ onDigit, onCancella, disabled }: { onDigit: (d: string) => void; onCancella: () => void; disabled: boolean }) {
  const tasti = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-3">
      {tasti.map((t, i) => {
        if (t === "") return <span key={`vuoto-${i}`} />;
        if (t === "⌫") {
          return (
            <button
              key={t}
              type="button"
              onClick={onCancella}
              disabled={disabled}
              className="rounded-xl font-bold text-lg disabled:opacity-50"
              style={{ height: 64, background: "#F5F2EE", color: "var(--color-black)" }}
            >
              ⌫
            </button>
          );
        }
        return (
          <button
            key={t}
            type="button"
            onClick={() => onDigit(t)}
            disabled={disabled}
            className="rounded-xl font-bold text-2xl disabled:opacity-50"
            style={{ height: 64, background: "#F5F2EE", color: "var(--color-black)" }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function SelettoreOperatore({ onOk }: { onOk: (op: OperatoreLoggato) => void }) {
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [search, setSearch] = useState("");
  const [selezionato, setSelezionato] = useState<Operatore | null>(null);
  const [pin, setPin] = useState("");
  const [errore, setErrore] = useState("");
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    fetch("/api/ore/operatore/lista")
      .then(r => r.json())
      .then(json => setOperatori(Array.isArray(json) ? json : []))
      .catch(() => setErrore("Errore caricamento operatori"));
  }, []);

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q ? operatori.filter(o => `${o.cognome} ${o.nome}`.toLowerCase().includes(q)) : operatori;
    return base.slice(0, 40);
  }, [operatori, search]);

  async function handleDigit(d: string) {
    if (verificando || !selezionato) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setErrore("");
    if (next.length === 4) {
      setVerificando(true);
      try {
        const res = await fetch("/api/ore/operatore/verifica-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matricola: selezionato.matricola, pin: next }),
        });
        const json = await res.json();
        if (!res.ok) {
          setErrore(json.error ?? "PIN errato");
          setPin("");
          return;
        }
        onOk({ matricola: json.matricola, cognome: json.cognome, nome: json.nome, reparto: json.reparto, azienda: json.azienda });
      } catch {
        setErrore("Errore di rete");
        setPin("");
      } finally {
        setVerificando(false);
      }
    }
  }

  if (selezionato) {
    return (
      <div className="rounded-2xl border bg-white p-6 space-y-5 text-center" style={{ borderColor: "#E4E0DA" }}>
        <div>
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Ciao</p>
          <p className="text-2xl font-bold" style={{ color: "var(--color-black)" }}>{selezionato.cognome} {selezionato.nome}</p>
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--color-grey-mid)" }}>Inserisci il tuo PIN</p>
        <div className="flex items-center justify-center gap-3">
          {[0, 1, 2, 3].map(i => (
            <span
              key={i}
              className="rounded-full"
              style={{ width: 16, height: 16, background: i < pin.length ? "var(--color-primary)" : "#E4E0DA" }}
            />
          ))}
        </div>
        {errore && <p className="text-sm font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
        <Tastierino onDigit={handleDigit} onCancella={() => setPin(p => p.slice(0, -1))} disabled={verificando} />
        <button
          type="button"
          onClick={() => { setSelezionato(null); setPin(""); setErrore(""); }}
          className="text-sm font-medium underline"
          style={{ color: "var(--color-grey-mid)" }}
        >
          ← Non sono io
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-6 space-y-4" style={{ borderColor: "#E4E0DA" }}>
      <h1 className="text-xl font-bold text-center" style={{ color: "var(--color-black)" }}>Chi sei?</h1>
      <input
        type="text"
        autoFocus
        className="w-full rounded-xl border px-4 text-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ height: 56, borderColor: "#d1d5db" }}
        placeholder="Cerca il tuo nome…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {errore && <p className="text-sm font-medium text-center" style={{ color: "#991B1B" }}>{errore}</p>}
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 420 }}>
        {filtrati.map(o => (
          <button
            key={o.matricola}
            type="button"
            onClick={() => setSelezionato(o)}
            className="w-full text-left px-4 py-3 rounded-xl border hover:bg-orange-50"
            style={{ borderColor: "#e5e4e0" }}
          >
            <span className="font-semibold text-base" style={{ color: "var(--color-black)" }}>{o.cognome} {o.nome}</span>
            <span className="block text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{o.reparto}</span>
          </button>
        ))}
        {filtrati.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: "var(--color-grey-mid)" }}>Nessun operatore trovato</p>
        )}
      </div>
    </div>
  );
}

function SchermataLavoro({ operatore, onCambiaOperatore }: { operatore: OperatoreLoggato; onCambiaOperatore: () => void }) {
  const [odpList, setOdpList] = useState<OdpAttivo[]>([]);
  const [aperto, setAperto] = useState<SegmentoAperto | null>(null);
  const [segmentiOggi, setSegmentiOggi] = useState<SegmentoChiuso[]>([]);
  const [loading, setLoading] = useState(true);
  const [odp, setOdp] = useState<string | null>(null);
  const [rif, setRif] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  const caricaStato = useCallback(async (precompila = false) => {
    const res = await fetch(`/api/ore/operatore/stato?matricola=${operatore.matricola}`);
    const json = await res.json();
    if (res.ok) {
      setAperto(json.aperto);
      setSegmentiOggi(json.segmentiOggi);
      if (precompila && !json.aperto && json.odpGiornoPrecedente) {
        setOdp(json.odpGiornoPrecedente);
      }
    }
  }, [operatore.matricola]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/ore/operatore/odp-list").then(r => r.json()).then(json => setOdpList(Array.isArray(json) ? json : [])),
      caricaStato(true),
    ]).finally(() => setLoading(false));
  }, [caricaStato]);

  async function handleConferma() {
    if (!odp) { setErrore("Seleziona un ODP"); return; }
    setSalvando(true);
    setErrore("");
    try {
      const res = await fetch("/api/ore/operatore/segmento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricola: operatore.matricola, odp, rif }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore salvataggio");
      setOdp(null);
      setRif(false);
      await caricaStato();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvando(false);
    }
  }

  async function handleFineGiornata() {
    setSalvando(true);
    setErrore("");
    try {
      const res = await fetch("/api/ore/operatore/fine-giornata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricola: operatore.matricola }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore salvataggio");
      await caricaStato();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvando(false);
    }
  }

  const totaleOreOggi = segmentiOggi.reduce((s, seg) => s + (seg.ore ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 flex items-center justify-between" style={{ borderColor: "#E4E0DA" }}>
        <div>
          <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{operatore.reparto}</p>
          <p className="text-lg font-bold" style={{ color: "var(--color-black)" }}>{operatore.cognome} {operatore.nome}</p>
        </div>
        <button type="button" onClick={onCambiaOperatore} className="text-sm font-medium underline" style={{ color: "var(--color-grey-mid)" }}>
          Cambia operatore
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-center" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
      ) : (
        <>
          {aperto && (() => {
            const info = odpList.find(o => o.odp === aperto.odp);
            return (
              <div className="rounded-2xl border-2 p-5" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#166534" }}>Stai lavorando su</p>
                {info?.clienteInfo && (
                  <p className="text-sm font-semibold mt-1 truncate" style={{ color: "#166534" }}>{info.clienteInfo}</p>
                )}
                <p className="text-xl font-bold mt-0.5 truncate" style={{ color: "#14532D" }}>
                  {aperto.odp}
                  {info?.numeroScheda ? ` - ${info.numeroScheda}` : ""}
                  {info?.codiceArticolo ? ` (${info.codiceArticolo})` : ""}
                </p>
                <p className="text-sm mt-1" style={{ color: "#166534" }}>
                  Dalle {fmtOra(aperto.iniziatoAlle)}{aperto.rif ? " · Rifacimento" : ""}
                </p>
              </div>
            );
          })()}

          <div className="rounded-2xl border bg-white p-5 space-y-3" style={{ borderColor: "#E4E0DA" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>
              {aperto ? "Passa a un altro ODP" : "Su cosa stai lavorando?"}
            </p>
            <OdpSelettore odpList={odpList} value={odp} onChange={setOdp} placeholder="Cerca ODP…" />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rif} onChange={e => setRif(e.target.checked)} className="w-4 h-4 accent-red-600" />
              <span style={{ color: rif ? "#991B1B" : "var(--color-grey-mid)" }}>È un rifacimento?</span>
            </label>
            {errore && <p className="text-sm font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
            <button
              type="button"
              onClick={handleConferma}
              disabled={salvando || !odp}
              className="w-full py-3.5 rounded-xl text-base font-bold text-white disabled:opacity-60"
              style={{ background: "var(--color-primary)" }}
            >
              {salvando ? "…" : "Conferma"}
            </button>
          </div>

          {aperto && (
            <button
              type="button"
              onClick={handleFineGiornata}
              disabled={salvando}
              className="w-full py-3 rounded-xl text-sm font-bold border disabled:opacity-60"
              style={{ borderColor: "#d1d5db", color: "var(--color-black)" }}
            >
              Ho finito per oggi
            </button>
          )}

          {segmentiOggi.length > 0 && (
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: "#E4E0DA" }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>
                Oggi ({totaleOreOggi}h)
              </p>
              <div className="space-y-2">
                {segmentiOggi.map(seg => (
                  <div key={seg.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium" style={{ color: "var(--color-black)" }}>{seg.odp}{seg.rif ? " (rif.)" : ""}</span>
                    <span style={{ color: "var(--color-grey-mid)" }}>
                      {fmtOra(seg.iniziatoAlle)}–{seg.chiusoAlle ? fmtOra(seg.chiusoAlle) : "…"} · {seg.ore}h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
