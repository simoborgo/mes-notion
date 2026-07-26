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
