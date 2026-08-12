import { redirect } from "next/navigation";

export default function ImpostazioniIndexPage() {
  redirect("/admin/impostazioni/audit-log");
}
