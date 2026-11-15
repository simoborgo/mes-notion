import { redirect } from "next/navigation";

// Vista assorbita dalla pagina unica Carichi (area di lavoro della commessa)
export default function OdpPerCaricoPage() {
  redirect("/carichi");
}
