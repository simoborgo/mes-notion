import { CLIENTI_VERNICIATURA } from "./types";

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
