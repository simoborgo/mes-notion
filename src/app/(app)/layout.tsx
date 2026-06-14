import Navbar from "@/components/Navbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1 px-6 py-6 w-full">
        {children}
      </main>
    </>
  );
}
