export function csvEscape(value: string | number | null | undefined, delimiter = ";"): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsvRow(values: (string | number | null | undefined)[], delimiter = ";"): string {
  return values.map((v) => csvEscape(v, delimiter)).join(delimiter);
}

// Chiave di join usata dalla skill "modar-programma-riunione" per collegare le righe Carichi
// alla Commessa corrispondente — replica esatta di norm(f"{num} {cli} - {loc} {info}") in Python.
export function commessaClienteInfoKey(c: { numeroCommessa: string; cliente: string; localita: string; info: string }): string {
  return `${c.numeroCommessa} ${c.cliente} - ${c.localita} ${c.info}`.trim().replace(/\s+/g, " ");
}

// Formato "Month D, YYYY" (inglese) — lo stesso che produce l'export CSV nativo di Notion e che
// il parser Python della skill si aspetta (MONTH_MAP con nomi mese inglesi).
export function formatDateEnUS(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
