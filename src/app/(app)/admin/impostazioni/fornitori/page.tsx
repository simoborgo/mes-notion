import { redirect } from "next/navigation";
import { getSession, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { getFornitoriList } from "@/lib/fornitoriRepository";
import TabellaFornitori from "@/components/TabellaFornitori";
import ImpostazioniLayout from "@/components/ImpostazioniLayout";

export const dynamic = "force-dynamic";

export default async function AdminFornitoriPage() {
  const session = await getSession();
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    redirect("/");
  }

  const fornitori = await getFornitoriList();

  return (
    <ImpostazioniLayout>
      <TabellaFornitori fornitoriIniziali={fornitori} />
    </ImpostazioniLayout>
  );
}
