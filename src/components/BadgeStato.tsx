const colorMap: Record<string, { bg: string; text: string }> = {
  // Stato Scheda (nuovo)
  "Da iniziare":        { bg: "#F3F4F6", text: "#6B7280" },
  "In lavorazione":     { bg: "#FEF3C7", text: "#92400E" },
  "Materiale Pronto":   { bg: "#DBEAFE", text: "#1E40AF" },
  "Completato":         { bg: "#D1FAE5", text: "#065F46" },
  "Annullato":          { bg: "#FEE2E2", text: "#991B1B" },
  // Fase corrente
  "Sviluppo CNC":       { bg: "#EDE9FE", text: "#5B21B6" },
  "Sezionatura":        { bg: "#FEF3C7", text: "#92400E" },
  "Lavorazione CNC":    { bg: "#EDE9FE", text: "#4C1D95" },
  "Preassemblaggio":    { bg: "#FEF9C3", text: "#713F12" },
  "Finitura":           { bg: "#FCE7F3", text: "#9D174D" },
  "Montaggio Finale":   { bg: "#ECFDF5", text: "#065F46" },
  "Controllo Qualità":  { bg: "#DBEAFE", text: "#1E40AF" },
  // Commesse
  "In produzione":      { bg: "#FEF3C7", text: "#92400E" },
  "In spedizione":      { bg: "#DBEAFE", text: "#1E40AF" },
  "In montaggio":       { bg: "#D1FAE5", text: "#065F46" },
  "Chiusa":             { bg: "#E5E7EB", text: "#374151" },
  "ShopDrawing":        { bg: "#EDE9FE", text: "#5B21B6" },
  // Ritiri
  "In attesa":          { bg: "#FEF9C3", text: "#713F12" },
  "Spedito":            { bg: "#D1FAE5", text: "#065F46" },
  "Urgente":            { bg: "#FEE2E2", text: "#991B1B" },
  // Legacy
  "Completata":         { bg: "#D1FAE5", text: "#065F46" },
  "Annullata":          { bg: "#FEE2E2", text: "#991B1B" },
};

const fallback = { bg: "#F3F4F6", text: "#374151" };

export default function BadgeStato({ stato }: { stato: string }) {
  if (!stato) return null;
  const { bg, text } = colorMap[stato] ?? fallback;
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-medium rounded-sm whitespace-nowrap"
      style={{ background: bg, color: text, borderRadius: "var(--radius-badge)" }}
    >
      {stato}
    </span>
  );
}
