import Navbar from "@/components/Navbar";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <Navbar userName={session?.name} userRole={session?.role} />
      {/* min-w-0: senza, un figlio flex-col non si restringe mai sotto la larghezza del suo
          contenuto (es. una tabella larga) — invece di scorrere internamente (overflow-x-auto
          sulla tabella), spinge fuori l'intero layout della pagina. */}
      <main className="flex-1 min-w-0 px-3 py-4 sm:px-6 sm:py-6 w-full">
        {children}
      </main>
    </>
  );
}
