import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Col middleware attivo Next bufferizza il body delle richieste fino a questo limite (default 10MB)
    // e oltre lo TRONCA: l'Import Schede manda il PDF in base64 + anteprime pagina nel JSON, e un PDF
    // grande arrivava spezzato → req.json() falliva → 500 vuoto → "Unexpected end of JSON input".
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
