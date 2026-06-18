import Navbar from "@/components/Navbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 w-full">
        {children}
      </main>
    </>
  );
}
