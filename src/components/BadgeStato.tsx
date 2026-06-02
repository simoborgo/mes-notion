const colorMap: Record<string, { bg: string; text: string }> = {
  "In lavorazione Interna": { bg: "#FEF3C7", text: "#92400E" },
  "In lavorazione Esterna": { bg: "#DBEAFE", text: "#1E40AF" },
  "Completato": { bg: "#D1FAE5", text: "#065F46" },
  "Completata": { bg: "#D1FAE5", text: "#065F46" },
  "Chiusa": { bg: "#E5E7EB", text: "#374151" },
  "In attesa": { bg: "#FEF9C3", text: "#713F12" },
  "Spedito": { bg: "#D1FAE5", text: "#065F46" },
  "Annullato": { bg: "#FEE2E2", text: "#991B1B" },
  "ShopDrawing": { bg: "#EDE9FE", text: "#5B21B6" },
  "Urgente": { bg: "#FEE2E2", text: "#991B1B" },
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
