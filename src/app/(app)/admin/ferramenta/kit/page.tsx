import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSchedeOdpAvviate } from "@/lib/notion";
import TabellaKitOdp from "@/components/TabellaKitOdp";

export const dynamic = "force-dynamic";

export default async function KitOdpPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/");
  }

  const schede = await getSchedeOdpAvviate();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Kit Ferramenta per ODP
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Marca gli ODP che richiedono ferramenta e gestisci la distinta di preparazione
        </p>
      </div>
      <TabellaKitOdp schede={schede} />
    </div>
  );
}
