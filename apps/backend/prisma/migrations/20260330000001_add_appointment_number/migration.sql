-- Add sequential appointment_number to identify appointments without using UUIDs
-- in UI labels, error messages, and operational references.
ALTER TABLE "appointments"
  ADD COLUMN "appointment_number" SERIAL NOT NULL;

CREATE UNIQUE INDEX "appointments_appointment_number_key"
  ON "appointments"("appointment_number");
