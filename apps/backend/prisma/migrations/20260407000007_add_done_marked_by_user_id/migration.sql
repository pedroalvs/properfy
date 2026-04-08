-- AlterTable: add done_marked_by_user_id to appointments
ALTER TABLE "appointments" ADD COLUMN "done_marked_by_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_done_marked_by_user_id_fkey" FOREIGN KEY ("done_marked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from audit_logs: set done_marked_by_user_id from the actor who transitioned to DONE
UPDATE appointments a
SET done_marked_by_user_id = (
  SELECT al.actor_id
  FROM audit_logs al
  WHERE al.entity_type = 'Appointment'
    AND al.entity_id = a.id
    AND al.action = 'appointment.status_transition'
    AND al.after_json->>'status' = 'DONE'
  ORDER BY al.created_at DESC
  LIMIT 1
)
WHERE a.status IN ('DONE')
  AND a.done_marked_by_user_id IS NULL;
