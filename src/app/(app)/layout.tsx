import Navbar from "@/components/Navbar";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <Navbar userName={session?.name} userRole={session?.role} />
      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 w-full">
        {children}
      </main>
    </>
  );
}
