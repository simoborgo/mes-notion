import { getCarichi } from "@/lib/carichiRepository";
import { getSchede } from "@/lib/schedeRepository";
import { getRitiri } from "@/lib/ritiriRepository";
import { getCommesse } from "@/lib/commesseRepository";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [schede, ritiri, commesse, carichi] = await Promise.all([getSchede(), getRitiri(), getCommesse(), getCarichi()]);
  return <Dashboard schede={schede} ritiri={ritiri} commesse={commesse} carichi={carichi} />;
}
