import { getSession } from "@/lib/auth";
import { getSchede, getSottoschede } from "@/lib/notion";
import { redirect } from "next/navigation";
import SpedizioneVerifica from "@/components/SpedizioneVerifica";
import type { OdpEntry } from "@/app/api/verifiche/odp-list/route";

export const metadata = { title: "Spedizione Merci — MES Modar" };

export default async function SpedizioniPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [schede, sottoschede] = await Promise.all([getSchede(), getSottoschede()]);

  const ODP_RE = /^MP\d{2}-\d{3}$/i;
  const toEntries = (list: Awaited<ReturnType<typeof getSchede>>, isChild: boolean): OdpEntry[] =>
    list
      .filter(s => ODP_RE.test(s.odp))
      .map(s => ({
        id: s.id,
        odp: s.odp.toUpperCase(),
        label: s.numeroScheda,
        isChild,
        clienteInfo: s.clienteInfo,
        tipologia: s.tipologia,
        statoProdEsterna: s.statoProdEsterna,
        statoProduzione: s.statoProduzione,
        commessaNr: s.commessaNr,
      }));

  const odpList: OdpEntry[] = [
    ...toEntries(schede, false),
    ...toEntries(sottoschede, true),
  ].sort((a, b) => {
    if (a.isChild !== b.isChild) return a.isChild ? 1 : -1;
    return a.odp.localeCompare(b.odp);
  });

  return <SpedizioneVerifica userName={session.name} userRole={session.role} odpList={odpList} />;
}
