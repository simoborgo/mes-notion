// Costanti di ruolo — solo dati puri (tipi + array), nessun import server-only (next/headers
// ecc.). Questo è ciò che rende il file importabile anche da componenti client ("use client"),
// a differenza di src/lib/auth.ts che trascina next/headers e farebbe fallire la build.
//
// auth.ts ri-esporta tutto da qui (`export * from "./roles"`) per restare l'unico punto
// d'importazione lato server: questo file è l'unica fonte di verità, auth.ts non la duplica.

export type Role = "admin" | "operatore" | "logistica" | "spedizioni" | "produzione" | "responsabile_produzione" | "magazziniere" | "magazziniere_vernici" | "magazziniere_bordi" | "magazziniere_legno" | "magazziniere_tranciati" | "magazziniere_profili_metallici" | "ufficio_tecnico";

export const ALL_ROLES: Role[] = ["admin", "operatore", "logistica", "spedizioni", "produzione", "responsabile_produzione", "magazziniere", "magazziniere_vernici", "magazziniere_bordi", "magazziniere_legno", "magazziniere_tranciati", "magazziniere_profili_metallici", "ufficio_tecnico"];

export const WRITE_ROLES: Role[] = ["admin", "logistica"];
// Solo la creazione di un nuovo Ritiro/Consegna — non modifica/eliminazione (restano
// WRITE_ROLES) né i Carichi, che condividono WRITE_ROLES ma non vanno estesi qui.
export const RITIRI_CREATE_ROLES: Role[] = ["admin", "logistica", "produzione"];
export const CARICO_ROLES: Role[] = ["admin", "produzione"];
export const SCARICO_MATERIALE_ROLES: Role[] = ["admin", "logistica"];
export const SPEDIZIONI_ROLES: Role[] = ["admin", "spedizioni"];
export const RILEVAMENTO_ORE_ROLES: Role[] = ["admin", "responsabile_produzione"];
export const FERRAMENTA_ROLES: Role[] = ["admin", "magazziniere", "produzione"];
// Kit Commessa: chi può creare/importare/confermare (Ufficio Tecnico incluso) — la spunta con
// scarico reale della giacenza resta esclusiva di FERRAMENTA_ROLES, mai di ufficio_tecnico.
// Assegnare questo ruolo a una persona richiede modificare USERS_JSON sulla VPS (nessuna UI admin).
export const KIT_COMMESSA_CREA_ROLES: Role[] = [...FERRAMENTA_ROLES, "ufficio_tecnico"];
export const VERNICIATURA_ROLES: Role[] = ["admin", "produzione"];
// Solo il magazzino Vernici (giacenza/carico/scarico/inventario) — separato da VERNICIATURA_ROLES
// perché l'addetto al magazzino non deve necessariamente poter operare su Cicli/Campionature.
// produzione incluso (deciso con l'utente 2026-08-14). Assegnare magazziniere_vernici a una
// persona richiede modificare USERS_JSON sulla VPS (nessuna UI admin).
export const MAGAZZINO_VERNICI_ROLES: Role[] = ["admin", "magazziniere_vernici", "produzione"];
// Magazzino Bordi — stesso perimetro/motivazione di MAGAZZINO_VERNICI_ROLES, prima categoria dopo
// Vernici a riusare il motore di magazzino generico (vedi PROSSIME_IMPLEMENTAZIONI.md). Assegnare
// magazziniere_bordi a una persona richiede modificare USERS_JSON sulla VPS (nessuna UI admin).
export const MAGAZZINO_BORDI_ROLES: Role[] = ["admin", "magazziniere_bordi", "produzione"];
// Stesso perimetro/motivazione di MAGAZZINO_BORDI_ROLES — Legname, Tranciati, Profili Metallici
// (Collanti restano dentro Ferramenta, non hanno un proprio magazzino separato). Assegnare questi
// ruoli a una persona richiede modificare USERS_JSON sulla VPS (nessuna UI admin).
export const MAGAZZINO_LEGNO_ROLES: Role[] = ["admin", "magazziniere_legno", "produzione"];
export const MAGAZZINO_TRANCIATI_ROLES: Role[] = ["admin", "magazziniere_tranciati", "produzione"];
export const MAGAZZINO_PROFILI_METALLICI_ROLES: Role[] = ["admin", "magazziniere_profili_metallici", "produzione"];
export const MODIFICA_SCHEDA_ROLES: Role[] = ["admin", "produzione"];
export const RIENTRO_QUALITA_ROLES: Role[] = ["admin", "operatore", "logistica", "spedizioni", "produzione", "responsabile_produzione"];
// Chi, oltre a RITIRI_CREATE_ROLES, può organizzare il ritiro di una Rilavorazione già aperta dal
// pulsante "Inserisci un ritiro" di Rientro Qualità — operatore escluso (deciso con l'utente
// 2026-08-13): non può creare nessun Ritiro/Consegna, nemmeno per questa eccezione.
export const RITIRI_PICKUP_RILAVORAZIONE_ROLES: Role[] = RIENTRO_QUALITA_ROLES.filter(r => r !== "operatore");
// Nessun ruolo "commerciale" esiste oggi — solo admin per ora, facile da ampliare su richiesta.
export const OFFERTE_ROLES: Role[] = ["admin"];
export const PARAMETRI_REPARTO_ROLES: Role[] = ["admin"];
// APS (Advanced Planning & Scheduling) — anagrafica Reparti/Pattern_Ciclo, solo admin per ora.
export const REPARTI_ROLES: Role[] = ["admin"];
// Vista Gantt APS (sola lettura) — chi già lavora con Schede/Rilevamento Ore, non solo admin.
export const APS_GANTT_ROLES: Role[] = ["admin", "produzione", "responsabile_produzione"];
export const PREVISIONALE_ROLES: Role[] = ["admin"];
export const ORARI_TURNO_ROLES: Role[] = ["admin"];
export const IMPOSTAZIONI_ROLES: Role[] = ["admin"];
// Creazione/modifica di Commesse e Aree — stesso perimetro di CARICO_ROLES (deciso con l'utente
// 2026-08-13): Ufficio Tecnico non ha più questo permesso, solo admin e produzione.
export const COMMESSE_ROLES: Role[] = ["admin", "produzione"];
