import { redirect } from "next/navigation";

// Vista assorbita dalla pagina unica Carichi (filtro "Solo commesse con ODP da assegnare")
export default function OdpSenzaCaricoPage() {
  redirect("/carichi?daAssegnare=1");
}
