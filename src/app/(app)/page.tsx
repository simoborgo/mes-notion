import { getSchede, getRitiri, getCommesse } from "@/lib/notion";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [schede, ritiri, commesse] = await Promise.all([getSchede(), getRitiri(), getCommesse()]);
  return <Dashboard schede={schede} ritiri={ritiri} commesse={commesse} />;
}
