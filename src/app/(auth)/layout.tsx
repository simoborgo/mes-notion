import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "MES Dashboard — Accesso",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
