import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "MES Dashboard",
  description: "Gestione MES — Schede, Ritiri, Commesse",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="h-full">
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1 px-6 py-6 w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
