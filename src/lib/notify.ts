import { pool } from "./db";

export interface NotificaParams {
  entityType: string;
  entityId: string;
  eventType: string;
  eventId: string;
  webhookUrl: string | undefined;
  payload: Record<string, unknown>;
}

export interface NotificaResult {
  sent: boolean;
  duplicate: boolean;
  warning?: string;
}

// Punto unico di invio notifiche, con idempotenza persistita su Postgres
// (sopravvive a un riavvio server, a differenza di un lock in-memory).
// Agnostico dal chiamante: riceve il webhookUrl già risolto dall'env var.
export async function sendNotifica({ entityType, entityId, eventType, eventId, webhookUrl, payload }: NotificaParams): Promise<NotificaResult> {
  if (!webhookUrl) {
    return { sent: false, duplicate: false, warning: "Webhook notifiche non configurato" };
  }

  const { rows } = await pool.query(
    `INSERT INTO notifiche_inviate (entity_type, entity_id, event_type, event_id, payload)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (entity_type, entity_id, event_type, event_id) DO NOTHING
     RETURNING id`,
    [entityType, entityId, eventType, eventId, JSON.stringify(payload)]
  );
  if (rows.length === 0) {
    return { sent: false, duplicate: true };
  }
  const notificaId = rows[0].id;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      await pool.query(`UPDATE notifiche_inviate SET esito='fallita', errore=$2 WHERE id=$1`, [notificaId, `HTTP ${res.status}`]);
      return { sent: false, duplicate: false, warning: "Notifica non inviata: errore webhook" };
    }
    await pool.query(`UPDATE notifiche_inviate SET esito='inviata' WHERE id=$1`, [notificaId]);
    return { sent: true, duplicate: false };
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error && e.name === "AbortError" ? "timeout" : (e instanceof Error ? e.message : String(e));
    await pool.query(`UPDATE notifiche_inviate SET esito='fallita', errore=$2 WHERE id=$1`, [notificaId, msg]);
    return { sent: false, duplicate: false, warning: "Notifica non inviata: " + msg };
  }
}
