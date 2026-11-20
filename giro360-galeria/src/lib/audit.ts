import { q } from "./db";

export async function audit(actor: string, action: string, ref: { eventId?: string; mediaId?: string; details?: unknown } = {}) {
  await q("insert into audit_log(actor, action, event_id, media_id, details) values ($1,$2,$3,$4,$5)", [
    actor,
    action,
    ref.eventId ?? null,
    ref.mediaId ?? null,
    ref.details ? JSON.stringify(ref.details) : null,
  ]);
}
