import type { ColoreSistema } from "./types";
import { CLIENTI_VERNICIATURA } from "./types";

// Normalizza colore_codice secondo il sistema colore dichiarato, per evitare varianti di
// scrittura sullo stesso colore (es. "ral7016" / "RAL 7016" / "Ral-7016" -> "RAL 7016").
// Va chiamata dal route handler PRIMA di aprire la transazione (validazione bloccante fail-fast).
export function normalizzaColoreCodice(sistema: ColoreSistema, valore: string): string {
  const v = valore.trim();
  if (!v) throw new Error("colore_codice obbligatorio");

  switch (sistema) {
    case "RAL": {
      const cifre = v.replace(/\D/g, "");
      if (cifre.length !== 4) throw new Error(`Codice RAL non valido: "${valore}" (attese 4 cifre)`);
      return `RAL ${cifre}`;
    }
    case "NCS": {
      // Notazione ufficiale NCS: "S" + 4 cifre + codice tinta (es. "S 1002-Y50R"). L'estratto
      // reale (ETICHETTE_VERNICI_estratto.csv) non riporta lo spazio/trattino separatore, quindi
      // li ricostruiamo qui a partire dalla stringa compattata.
      const compatta = v.replace(/\s|-/g, "").toUpperCase();
      const match = compatta.match(/^S(\d{4})([A-Z0-9]*)$/);
      if (!match) throw new Error(`Codice NCS non valido: "${valore}" (attesa forma S seguito da 4 cifre)`);
      const [, cifre, tinta] = match;
      return tinta ? `NCS S${cifre}-${tinta}` : `NCS S${cifre}`;
    }
    case "Pantone": {
      const codice = v.replace(/^pantone\s*/i, "").trim().toUpperCase();
      if (!codice) throw new Error(`Codice Pantone non valido: "${valore}"`);
      return `PANTONE ${codice}`;
    }
    case "Custom": {
      // Nessun campo cliente in Vernici (anagrafica indipendente dal cliente): il nome libero
      // (che può già includere un riferimento cliente digitato dall'operatore) viene solo
      // title-case-ato, non ricomposto da un cliente strutturato che qui non esiste.
      return v
        .toLowerCase()
        .split(/\s+/)
        .map((parola) => (parola ? parola[0].toUpperCase() + parola.slice(1) : parola))
        .join(" ");
    }
    default: {
      const _exhaustive: never = sistema;
      throw new Error(`Sistema colore non gestito: ${_exhaustive}`);
    }
  }
}

// Valida il cliente contro la lista fissa applicativa (CLIENTI_VERNICIATURA) e restituisce la
// forma canonica (case-insensitive), o solleva un errore — validazione bloccante pre-transazione,
// stesso spirito di normalizzaCodiceFornitore/ferramentaCodici.ts ma qui contro un enum, non un
// confronto libero.
export function validaCliente(cliente: string): string {
  const v = cliente.trim();
  const match = CLIENTI_VERNICIATURA.find((c) => c.toLowerCase() === v.toLowerCase());
  if (!match) {
    throw new Error(`Cliente non riconosciuto: "${cliente}". Valori ammessi: ${CLIENTI_VERNICIATURA.join(", ")}`);
  }
  return match;
}

// Prefisso a 3 lettere per il barcode (es. "Gucci" -> "GUC", "Bottega Veneta" -> "BOT").
export function prefissoBarcodeCliente(cliente: string): string {
  const compatto = cliente.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (compatto.length < 3) throw new Error(`Impossibile derivare un prefisso barcode da "${cliente}"`);
  return compatto.slice(0, 3);
}
