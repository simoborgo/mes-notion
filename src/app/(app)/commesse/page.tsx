import { getCommesse, getSchede } from "@/lib/notion";
import TabellaCommesse from "@/components/TabellaCommesse";

export const dynamic = "force-dynamic";

export default async function CommessePage() {
  const [commesse, schede] = await Promise.all([getCommesse(), getSchede()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Commesse
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {commesse.length} commesse totali
        </p>
      </div>
      <TabellaCommesse commesse={commesse} schede={schede} />
    </div>
  );
}
