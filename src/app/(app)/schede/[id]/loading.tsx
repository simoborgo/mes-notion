// Scheletro mostrato mentre si apre una scheda o una sottoscheda: tiene la stessa impalcatura
// della pagina (percorso, banda titolo, tab, colonna laterale) invece dello spinner a tutta
// pagina del loading generale, così il passaggio da madre a figlia non "lampeggia".
export default function CaricamentoScheda() {
  const blocco = (w: string, h: string) => (
    <div className="rounded animate-pulse" style={{ width: w, height: h, background: "#ebe9e5" }} />
  );
  return (
    <div className="space-y-3 max-w-[1500px] mx-auto" aria-busy="true" aria-label="Caricamento scheda">
      {blocco("220px", "16px")}
      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "#e5e4e0" }}>
        <div className="px-6 py-5 space-y-2" style={{ background: "#FFE8CC" }}>
          {blocco("320px", "30px")}
          {blocco("220px", "18px")}
        </div>
        <div className="px-6 py-4" style={{ background: "#f3f2ef" }}>{blocco("420px", "18px")}</div>
        <div style={{ background: "#EDE9E3", height: 46 }} />
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px]" style={{ minHeight: 360 }}>
          <div className="px-6 py-5 space-y-3">{blocco("100%", "90px")}{blocco("100%", "140px")}</div>
          <div className="p-5 space-y-3" style={{ background: "#f8f7f5" }}>{blocco("100%", "70px")}{blocco("100%", "110px")}</div>
        </div>
      </div>
    </div>
  );
}
