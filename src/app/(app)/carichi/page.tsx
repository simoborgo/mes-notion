import { getCarichi, getCommesse } from "@/lib/notion";
import TabellaCarichi from "@/components/TabellaCarichi";

export const dynamic = "force-dynamic";

export default async function CarichiPage() {
  const [carichi, commesse] = await Promise.all([getCarichi(), getCommesse()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Carichi
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {carichi.length} carichi · aggiornato {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <TabellaCarichi carichi={carichi} commesse={commesse} />
    </div>
  );
}
