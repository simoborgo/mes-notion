import { getSession, SPEDIZIONI_ROLES, WRITE_ROLES } from "@/lib/auth";
import { getSchede, getSottoschede } from "@/lib/schedeRepository";
import { getCasse } from "@/lib/casseRepository";
import { getCommesse } from "@/lib/commesseRepository";
import { redirect } from "next/navigation";
import SpedizioniHub from "@/components/SpedizioniHub";
import type { OdpEntry } from "@/app/api/verifiche/odp-list/route";

export const metadata = { title: "Spedizione Merci — MES Modar" };

const TAB_VALIDI = ["verifica", "packing"] as const;

export default async function SpedizioniPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!SPEDIZIONI_ROLES.includes(session.role)) redirect("/");

  const { tab } = await searchParams;
  const tabIniziale = TAB_VALIDI.includes(tab as typeof TAB_VALIDI[number]) ? (tab as typeof TAB_VALIDI[number]) : "verifica";

  const [schede, sottoschede, casse, commesse] = await Promise.all([
    getSchede(), getSottoschede(), getCasse(), getCommesse(),
  ]);

  const ODP_RE = /^MP\d{2}-\d{3}$/i;
  const toEntries = (list: Awaited<ReturnType<typeof getSchede>>, isChild: boolean): OdpEntry[] =>
    list
      .filter(s => ODP_RE.test(s.odp))
      .map(s => ({
        id: s.id,
        odp: s.odp.toUpperCase(),
        label: s.numeroScheda,
        isChild,
        parentId: s.parentId,
        clienteInfo: s.clienteInfo,
        tipologia: s.tipologia,
        statoProdEsterna: s.statoProdEsterna,
        statoProduzione: s.statoProduzione,
        commessaNr: s.commessaNr,
        hasPdfAllegato: s.pdfAllegato.length > 0,
      }));

  const odpList: OdpEntry[] = [
    ...toEntries(schede, false),
    ...toEntries(sottoschede, true),
  ].sort((a, b) => {
    if (a.isChild !== b.isChild) return a.isChild ? 1 : -1;
    return a.odp.localeCompare(b.odp);
  });

  const canWritePacking = WRITE_ROLES.includes(session.role);

  return (
    <SpedizioniHub
      userName={session.name}
      userRole={session.role}
      odpList={odpList}
      casse={casse}
      commesse={commesse}
      schede={schede}
      canWritePacking={canWritePacking}
      tabIniziale={tabIniziale}
    />
  );
}
