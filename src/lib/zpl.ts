export interface EtichettaRiordinoZplData {
  codiceOs1: string;
  descrizione: string;
  fornitoreNomeOs1: string;
  quantitaStandardVaschetta: number | null;
  qrUrl: string;
  stampatoIl: Date;
}

// ^ e ~ avviano rispettivamente i comandi ZPL (CC1) e di controllo (CC2): un campo
// testo libero (descrizione/fornitore da Notion) che li contenesse romperebbe il markup.
function escZpl(s: string): string {
  return (s ?? "").replace(/[\^~]/g, "");
}

function formatStampatoIl(d: Date): string {
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Etichetta 100mm x 60mm a 203dpi (~8 dot/mm, risoluzione standard stampanti desktop Zebra).
const DOTS_PER_MM = 8;
const mm = (n: number) => Math.round(n * DOTS_PER_MM);

export function buildEtichettaRiordinoZpl(data: EtichettaRiordinoZplData): string {
  const descrizione = escZpl(data.descrizione || "-");
  const codiceOs1 = escZpl(data.codiceOs1 || "-");
  const fornitore = escZpl(data.fornitoreNomeOs1 || "-");
  const quantita = data.quantitaStandardVaschetta ?? "-";
  const stampatoIl = escZpl(formatStampatoIl(data.stampatoIl));

  return `^XA
^CI28
^PW${mm(100)}
^LL${mm(60)}
^LH0,0

^FO${mm(5)},${mm(4)}^A0N,22,22^FDRIORDINO KANBAN - FERRAMENTA MES MODAR^FS

^FO${mm(5)},${mm(9)}^A0N,36,36^FD${descrizione}^FS
^FO${mm(5)},${mm(15)}^A0N,26,26^FD${codiceOs1}^FS

^FO${mm(5)},${mm(20)}^A0N,20,20^FDCod. Fornitore: ${fornitore}^FS
^FO${mm(5)},${mm(24)}^A0N,28,28^FDQta da riordinare: ${quantita}^FS

^FO${mm(5)},${mm(30)}
^BQN,2,6
^FDMA,${data.qrUrl}^FS

^FO${mm(33)},${mm(30)}^A0N,18,18^FDInquadra per info riordino^FS

^FO${mm(5)},${mm(55)}^A0N,16,16^FDStampato il ${stampatoIl}^FS
^XZ
`;
}
