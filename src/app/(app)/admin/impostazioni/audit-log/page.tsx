import { redirect } from "next/navigation";
import { getSession, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { getAuditLog } from "@/lib/audit";
import ImpostazioniLayout from "@/components/ImpostazioniLayout";
import AuditLogTable from "@/components/AuditLogTable";

export const dynamic = "force-dynamic";

export default async function AdminLogPage() {
  const session = await getSession();

  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    redirect("/");
  }

  const entries = await getAuditLog(200);

  return (
    <ImpostazioniLayout>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Registro cronologico di tutte le operazioni di modifica
        </p>
      </div>

      {entries.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "white", border: "1px solid #e5e4e0" }}
        >
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
            Nessuna operazione registrata nel log.
          </p>
        </div>
      ) : (
        <AuditLogTable entries={entries} />
      )}
    </ImpostazioniLayout>
  );
}
