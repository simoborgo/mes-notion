// Prefisso a 3 lettere per il barcode (es. "Gucci" -> "GUC", "Bottega Veneta" -> "BOT").
export function prefissoBarcodeCliente(cliente: string): string {
  const compatto = cliente.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (compatto.length < 3) throw new Error(`Impossibile derivare un prefisso barcode da "${cliente}"`);
  return compatto.slice(0, 3);
}
