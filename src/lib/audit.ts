import { pool } from "./db";

export type ResourceType = "ritiro" | "scheda" | "carico" | "commessa" | "area" | "ore_registrate" | "ore_assenza" | "operatore" | "operatore_pin" | "segmento_operatore" | "scarico_materiale" | "scarico" | "offerta" | "articolo_ferramenta" | "kit_ferramenta" | "inventario_ferramenta" | "wurth_ordine" | "wurth_ordine_riga" | "parametri_reparto" | "parametri_generali" | "laboratorio_verniciatura" | "vernice" | "ciclo_verniciatura" | "campionatura_verniciatura" | "movimento_magazzino" | "inventario_magazzino" | "kit_commessa" | "fornitore";
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
