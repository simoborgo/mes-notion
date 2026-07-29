export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <span
        className="animate-spin inline-block text-2xl"
        style={{ color: "var(--color-primary)" }}
      >
        ↻
      </span>
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Caricamento dati da Notion…
        <br />
        Può richiedere fino a 20 secondi se i dati sono stati appena aggiornati.
      </p>
    </div>
  );
}
