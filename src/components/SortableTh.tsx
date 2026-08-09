"use client";

// Header di tabella ordinabile, condiviso dalle tabelle Verniciatura — stesso pattern/markup di
// Th in TabellaArticoliFerramenta.tsx, estratto qui perché riusato da 4 tabelle diverse invece
// che da una sola (lì non valeva la pena condividerlo).
export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className="ml-1 inline-block text-[10px] opacity-60">
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

export function Th<K extends string>({
  label, sortKey, currentSortKey, sortDir, onSort, className = "",
}: {
  label: string;
  sortKey: K;
  currentSortKey: K;
  sortDir: "asc" | "desc";
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sortKey === currentSortKey;
  return (
    <th
      className={`px-4 py-3 whitespace-nowrap select-none cursor-pointer hover:bg-orange-50/50 ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <SortIcon active={active} dir={active ? sortDir : "asc"} />
    </th>
  );
}
