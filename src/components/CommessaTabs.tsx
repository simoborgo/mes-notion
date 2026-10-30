"use client";

import Link from "next/link";

export interface CommessaTab {
  key: string;
  label: string;
  count?: number;
}

export default function CommessaTabs({ commessaId, tabs, attiva }: { commessaId: string; tabs: CommessaTab[]; attiva: string }) {
  return (
    <div role="tablist" className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: "#E4E0DA" }}>
      {tabs.map((t) => {
        const active = t.key === attiva;
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={active}
            href={t.key === "panoramica" ? `/commesse/${commessaId}` : `/commesse/${commessaId}?tab=${t.key}`}
            scroll={false}
            className="px-4 py-2 text-sm font-medium whitespace-nowrap flex items-center gap-1.5 -mb-px border-b-2"
            style={{ borderColor: active ? "var(--color-primary)" : "transparent", color: active ? "var(--color-black)" : "var(--color-grey-mid)" }}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="text-xs rounded-full px-1.5" style={{ background: "#EFEBE5", color: "var(--color-grey-mid)" }}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
