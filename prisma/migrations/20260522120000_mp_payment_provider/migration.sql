-- Mercado Pago integration (BRL recurring + PIX dunning).
--
-- Adds the provider discriminator on User, the MP PreApproval id slot,
-- and the PixCharge table that backs the manual-PIX dunning flow
-- (D-5/D-2/D-0 reminders, banner, suspension on D+14).
--
-- Paddle columns on User stay untouched — existing Paddle subscribers
-- are grandfathered; new signups land on MP via getActiveProvider().

ALTER TABLE "User" ADD COLUMN "payment_provider" TEXT;
ALTER TABLE "User" ADD COLUMN "mp_preapproval_id" TEXT;
CREATE UNIQUE INDEX "User_mp_preapproval_id_key" ON "User"("mp_preapproval_id");

CREATE TABLE "PixCharge" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "mp_payment_id"      TEXT,
  "amount_cents"       INTEGER NOT NULL,
  "currency"           TEXT NOT NULL DEFAULT 'BRL',
  "qr_code"            TEXT,
  "qr_code_base64"     TEXT,
  "ticket_url"         TEXT,
  "status"             TEXT NOT NULL DEFAULT 'pending',
  "due_at"             TIMESTAMP(3) NOT NULL,
  "expires_at"         TIMESTAMP(3),
  "paid_at"            TIMESTAMP(3),
  "external_reference" TEXT NOT NULL,
  "reminders_sent"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PixCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PixCharge_mp_payment_id_key"      ON "PixCharge"("mp_payment_id");
CREATE UNIQUE INDEX "PixCharge_external_reference_key" ON "PixCharge"("external_reference");
CREATE INDEX        "PixCharge_status_due_at_idx"      ON "PixCharge"("status", "due_at");
CREATE INDEX        "PixCharge_userId_created_at_idx"  ON "PixCharge"("userId", "created_at");
CREATE INDEX        "PixCharge_organizationId_status_idx" ON "PixCharge"("organizationId", "status");

ALTER TABLE "PixCharge"
  ADD CONSTRAINT "PixCharge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
