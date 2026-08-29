import { pool } from "./db";

export type ResourceType = "ritiro" | "scheda" | "carico" | "commessa" | "area" | "ore_registrate" | "ore_assenza" | "ore_giorno_chiuso" | "operatore" | "operatore_pin" | "segmento_operatore" | "scarico_materiale" | "scarico" | "offerta" | "articolo_ferramenta" | "kit_ferramenta" | "inventario_ferramenta" | "wurth_ordine" | "wurth_ordine_riga" | "parametri_reparto" | "parametri_generali" | "laboratorio_verniciatura" | "vernice" | "ciclo_verniciatura" | "campionatura_verniciatura" | "movimento_magazzino" | "inventario_magazzino" | "kit_commessa" | "fornitore" | "reparto" | "articolo" | "pattern_ciclo" | "bordo" | "legno" | "tranciato" | "profilo_metallico";
export type ActionType = "CREATE" | "UPDATE" | "DELETE" | "UPLOAD_FOTO";

export interface AuditEntry {
  id: string;
  operatore: string;
  azione: string;
  idRisorsa: string;
  modifiche: string;
  timestamp: string | null;
}

/**
 * Registra un'operazione di modifica nell'audit log.
 * La chiamata va fatta senza await (fire-and-forget) nei route handler
 * per non aggiungere latenza alla risposta HTTP.
 *
 * @example
 * void logOperation(session.name, "UPDATE", "ritiro", id, changes);
 */
export async function logOperation(
  operatorName: string,
  action: ActionType,
  resourceType: ResourceType,
  resourceId: string,
  changes: Record<string, unknown>
): Promise<void> {
  console.log(
    `[audit] ${operatorName} | ${action} ${resourceType}/${resourceId} |`,
    JSON.stringify(changes)
  );

  try {
    await pool.query(
      `INSERT INTO audit_log (operatore, azione, id_risorsa, modifiche) VALUES ($1, $2, $3, $4)`,
      [operatorName, `${action} ${resourceType}`, resourceId, JSON.stringify(changes)],
    );
  } catch (e) {
    console.error("[audit] write failed:", e instanceof Error ? e.message : String(e));
  }
}

// Storico di UNA risorsa specifica (es. tutte le modifiche a un reparto in parametri_reparto),
// più mirata di getAuditLog. Utile quando il valore corrente da solo non basta e serve
// ricostruire come è cambiato nel tempo — es. Storico Parametri Reparto, che riusa audit_log
// invece di una tabella di versioning dedicata (ogni PATCH di parametri_reparto scrive già uno
// snapshot completo dei campi, non un diff parziale, quindi ogni riga è uno stato pieno).
export async function getAuditLogByRisorsa(azione: string, idRisorsa: string, limit = 50): Promise<AuditEntry[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, operatore, azione, id_risorsa, modifiche, creato_il FROM audit_log
       WHERE azione = $1 AND id_risorsa = $2 ORDER BY creato_il DESC LIMIT $3`,
      [azione, idRisorsa, limit],
    );
    return rows.map((r) => ({
      id: r.id as string,
      operatore: r.operatore as string,
      azione: r.azione as string,
      idRisorsa: r.id_risorsa as string,
      modifiche: r.modifiche as string,
      timestamp: (r.creato_il as Date).toISOString(),
    }));
  } catch (e) {
    console.error("[audit] getAuditLogByRisorsa failed:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

// Tutte le voci di una AZIONE (indipendentemente dalla risorsa) — usata quando serve costruire lo
// storico di più risorse in un colpo solo (es. tutti i reparti di parametri_reparto per il
// Previsionale) invece di N query separate via getAuditLogByRisorsa.
export async function getAuditLogByAzione(azione: string, limit = 1000): Promise<AuditEntry[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, operatore, azione, id_risorsa, modifiche, creato_il FROM audit_log
       WHERE azione = $1 ORDER BY creato_il DESC LIMIT $2`,
      [azione, limit],
    );
    return rows.map((r) => ({
      id: r.id as string,
      operatore: r.operatore as string,
      azione: r.azione as string,
      idRisorsa: r.id_risorsa as string,
      modifiche: r.modifiche as string,
      timestamp: (r.creato_il as Date).toISOString(),
    }));
  } catch (e) {
    console.error("[audit] getAuditLogByAzione failed:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, operatore, azione, id_risorsa, modifiche, creato_il FROM audit_log ORDER BY creato_il DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id as string,
      operatore: r.operatore as string,
      azione: r.azione as string,
      idRisorsa: r.id_risorsa as string,
      modifiche: r.modifiche as string,
      timestamp: (r.creato_il as Date).toISOString(),
    }));
  } catch (e) {
    console.error("[audit] getAuditLog failed:", e instanceof Error ? e.message : String(e));
    return [];
  }
}
