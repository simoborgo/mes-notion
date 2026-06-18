# MES Dashboard — Stato Progetto

## Stack
- Next.js 15 App Router + TypeScript + Tailwind CSS 4
- `@notionhq/client` v2.2.15
- Deploy: VPS Hostinger `mes.modar.cloud` via Docker + Traefik
- Repo: https://github.com/simoborgo/mes-notion

## Struttura cartelle
```
src/
├── app/
│   ├── (app)/          # Layout con Navbar — tutte le pagine autenticate
│   │   ├── layout.tsx
│   │   ├── page.tsx         # Dashboard
│   │   ├── schede/          # Schede di Produzione (ODP)
│   │   ├── commesse/        # Commesse + dettaglio [id]
│   │   └── ritiri/          # Ritiri e Consegne
│   ├── (auth)/         # Layout senza Navbar — solo login
│   │   └── login/
│   ├── api/
│   │   ├── auth/        # POST login / DELETE logout (cookie httpOnly)
│   │   └── commesse/[id]/  # GET commessa + aree + schede
│   └── globals.css
├── components/
│   ├── Navbar.tsx           # Hamburger su mobile, tab su desktop
│   ├── Dashboard.tsx        # KPI cards + Gantt timeline + tabella montaggio
│   ├── GanttChart           # (inline in Dashboard.tsx)
│   ├── TabellaSchede.tsx    # Tabella ODP con filtri multi-stato
│   ├── TabellaCommesse.tsx  # Tabella commesse con filtri
│   ├── DettaglioCommessaModal.tsx  # Popup dettaglio commessa
│   └── BadgeStato.tsx       # Badge colorati per tutti gli stati
└── lib/
    ├── notion.ts        # Client Notion + helpers + funzioni query
    └── types.ts         # Tipi TypeScript
```

## Database Notion
| Variabile env | Database |
|---|---|
| `NOTION_DB_SCHEDE` | `206cca12609880aebe13c9ce0d5c4ae1` |
| `NOTION_DB_COMMESSE` | `206cca12609880aea500ea681c4533fb` |
| `NOTION_DB_AREE` | `206cca12609880ae8f7ecec8c191de04` |
| `NOTION_DB_RITIRI` | `2afcca12609880168449c3e87e9760d3` |

## Campi Notion critici (Schede di Produzione)
- `"Stato"` — status type — valori: `Da iniziare / In lavorazione / Materiale Pronto / Completato / Annullato`
- `"Fase corrente"` — select — valori: `Sviluppo CNC / Sezionatura / Lavorazione CNC / Preassemblaggio / Finitura / Montaggio Finale / Controllo Qualità`
- `"Nome Fornitore"` — rollup (NON relation) → usare questo per il testo
- `"Commessa Nr"` — relation → usare questo per filtrare schede per commessa
- `"Area-Cartella Commessa"` — relation

## Campi Notion critici (Commesse)
- `"Stato"` — **status type** (non select!) → gestito con `getText` che legge `p.status?.name`
- `"Giorni Montaggio"` — **formula** → gestito con `getNumber` che legge `p.formula?.number`

## Auth
- Cookie httpOnly `mes_session` = `"authenticated"`
- Middleware Next.js controlla cookie su tutte le route tranne `/login` e `/api/auth`
- `APP_PASSWORD` env var per la password di accesso
- **Nota**: il middleware gira su Edge Runtime → NON può leggere `process.env` a runtime → usa valore cookie fisso

## VPS Deploy
```bash
# Sul VPS (da /var/www/mes-notion)
git pull && npm run build

# Da /docker/n8n
docker compose up -d --force-recreate mes-notion
```
- File env VPS: `/root/.env.mes-notion`
- Container: `n8n-mes-notion-1`
- docker-compose: `/docker/n8n/docker-compose.yml`

## .env.local (locale)
```
NODE_TLS_REJECT_UNAUTHORIZED=0
NODE_OPTIONS=--no-deprecation
NOTION_TOKEN=<vedi .env.local sul PC originale>
NOTION_DB_SCHEDE=<vedi .env.local>
NOTION_DB_COMMESSE=<vedi .env.local>
NOTION_DB_AREE=<vedi .env.local>
NOTION_DB_RITIRI=<vedi .env.local>
APP_PASSWORD=<vedi .env.local>
SESSION_SECRET=<vedi .env.local>
```

## Funzionalità implementate
- ✅ Dashboard con 4 KPI cards (Commesse in produzione, In spedizione questo mese, ShopDrawing, ODP in lavorazione)
- ✅ Gantt timeline commesse "In produzione" con dot carico + barra montaggio + tooltip hover + linea TODAY rossa
- ✅ Tabella commesse "In montaggio" sotto il Gantt
- ✅ Login page con password + cookie httpOnly + middleware protezione
- ✅ Navbar responsive (hamburger mobile, tab desktop)
- ✅ Tabella Schede ODP con filtri multi-stato (default: tutto tranne Completato), colonna Fase corrente
- ✅ Tabella Commesse con filtri (default: senza Chiuse), modal dettaglio popup
- ✅ DettaglioCommessaModal: info commessa + lista schede + aree accordion
- ✅ BadgeStato con colori per tutti gli stati Schede, Commesse, Fasi, Ritiri
- ✅ Ottimizzazione mobile/tablet

## TODO / Sviluppi futuri
- [ ] Aggiornamento stato ODP inline (dropdown diretto in tabella)
- [ ] Ritiri e Consegne: creazione da app, vista urgenti, calendario
- [ ] Alert ritardi automatici in dashboard
- [ ] Completamento commessa (% schede completate) in dashboard
- [ ] Percorso NAS per riga scheda (da definire con utente)
- [ ] Restrizione accesso per IP LAN via Traefik middleware
- [ ] Export PDF lista ODP

## Note tecniche importanti
- `export const dynamic = "force-dynamic"` su tutte le pagine server per evitare prerender senza NOTION_TOKEN
- `NODE_TLS_REJECT_UNAUTHORIZED=0` SOLO in `.env.local` locale (rete aziendale con cert custom) — MAI su VPS
- CSS non si carica su VPS se si usa `--force-recreate` dopo un build pulito con `rm -rf .next` → soluzione: rebuild + force-recreate insieme
- Turbopack NON usato in produzione (`next build` standard)
- Route groups `(app)` e `(auth)` separano il layout con/senza Navbar — necessario per evitare hydration error #418 sulla login
