import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChanges(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(" | ");
  } catch {
    return raw;
  }
}

export default async function AdminLogPage() {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    redirect("/");
  }

  const entries = await getAuditLog(200);
  const dbConfigured = !!process.env.NOTION_DB_AUDIT;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-black)" }}>
            Audit Log
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Registro cronologico di tutte le operazioni di modifica
          </p>
        </div>
        {!dbConfigured && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
          >
            <strong>NOTION_DB_AUDIT</strong> non configurata — i log sono solo in console.
            <br />
            Crea un database Notion con campi: Operatore (title), Azione (rich_text),
            ID Risorsa (rich_text), Modifiche (rich_text), Timestamp (date).
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "white", border: "1px solid #e5e4e0" }}
        >
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
            {dbConfigured
              ? "Nessuna operazione registrata nel log."
              : "Log non disponibile — configura NOTION_DB_AUDIT per abilitare la persistenza."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e5e4e0" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#f8f7f5", borderBottom: "1px solid #e5e4e0" }}>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", whiteSpace: "nowrap" }}>
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                    Operatore
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                    Azione
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                    ID Risorsa
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                    Modifiche
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    style={{
                      background: i % 2 === 0 ? "white" : "#fafaf9",
                      borderBottom: "1px solid #f0efed",
                    }}
                  >
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-grey-mid)", whiteSpace: "nowrap" }}>
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--color-black)", whiteSpace: "nowrap" }}>
                      {entry.operatore || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          background: entry.azione.startsWith("DELETE")
                            ? "#fee2e2"
                            : entry.azione.startsWith("CREATE")
                            ? "#dcfce7"
                            : "#e0e7ff",
                          color: entry.azione.startsWith("DELETE")
                            ? "#991b1b"
                            : entry.azione.startsWith("CREATE")
                            ? "#166534"
                            : "#3730a3",
                        }}
                      >
                        {entry.azione || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "#6b6966" }}>
                      {entry.idRisorsa ? (
                        <span title={entry.idRisorsa}>
                          {entry.idRisorsa.slice(0, 8)}…
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-grey-mid)", wordBreak: "break-all" }}
                        title={entry.modifiche}
                      >
                        {entry.modifiche ? formatChanges(entry.modifiche) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs" style={{ background: "#f8f7f5", color: "var(--color-grey-mid)", borderTop: "1px solid #e5e4e0" }}>
            {entries.length} operazioni — ultime 200
          </div>
        </div>
      )}
    </div>
  );
}
