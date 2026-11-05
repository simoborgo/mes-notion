// Interpreta un messaggio Telegram del tipo
//   [/nota] 24-081 ODP 56 Il cliente conferma la finitura entro 20/11
// → commessa "24-081", ODP "56" (opzionale), testo, data di scadenza (opzionale, "entro gg/mm[/aa]").
export interface MessaggioCommessa {
  commessa: string;
  odp: string | null;
  testo: string;
  scadenza: string | null; // YYYY-MM-DD
}

export function interpretaMessaggio(messaggio: string, oggi: string): MessaggioCommessa | { errore: string } {
  let m = messaggio.trim().replace(/^\/\w+(@\w+)?\s*/, "");
  const primo = m.match(/^(\S+)\s*/);
  if (!primo) return { errore: "Formato: <commessa> [ODP <n>] testo [entro gg/mm]" };
  const commessa = primo[1];
  m = m.slice(primo[0].length);

  let odp: string | null = null;
  const mo = m.match(/^odp\s*[:#-]?\s*(\S+)\s*/i);
  if (mo) { odp = mo[1]; m = m.slice(mo[0].length); }

  let scadenza: string | null = null;
  const md = m.match(/\bentro(?:\s+il)?\s+(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/i);
  if (md) {
    const g = Number(md[1]), mese = Number(md[2]);
    if (g < 1 || g > 31 || mese < 1 || mese > 12) return { errore: `Data non valida: ${md[0]}` };
    const [oy, om, og] = oggi.split("-").map(Number);
    let anno = md[3] ? Number(md[3]) : oy;
    if (md[3] && anno < 100) anno += 2000;
    // Senza anno: se la data è passata da oltre due mesi si intende l'anno prossimo.
    if (!md[3] && Date.UTC(anno, mese - 1, g) < Date.UTC(oy, om - 1 - 2, og)) anno += 1;
    const d = new Date(Date.UTC(anno, mese - 1, g));
    if (d.getUTCMonth() !== mese - 1) return { errore: `Data non valida: ${md[0]}` };
    scadenza = d.toISOString().slice(0, 10);
    m = (m.slice(0, md.index) + m.slice((md.index ?? 0) + md[0].length)).replace(/\s{2,}/g, " ");
  }

  const testo = m.trim().replace(/[\s,;.-]+$/, "");
  if (!testo) return { errore: "Manca il testo della nota" };
  return { commessa, odp, testo, scadenza };
}
