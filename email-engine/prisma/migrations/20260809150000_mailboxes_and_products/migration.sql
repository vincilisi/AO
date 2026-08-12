-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "autoReply" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'cad.',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 22,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Email"
    ADD COLUMN "mailboxId" TEXT,
    ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    ADD COLUMN "inReplyTo" TEXT,
    ADD COLUMN "sentAt" TIMESTAMP(3),
    ADD COLUMN "repliedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_companyId_email_key" ON "Mailbox"("companyId", "email");
CREATE INDEX "Mailbox_companyId_isPrimary_idx" ON "Mailbox"("companyId", "isPrimary");
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
CREATE INDEX "Product_companyId_active_idx" ON "Product"("companyId", "active");
CREATE INDEX "Email_companyId_direction_receivedAt_idx" ON "Email"("companyId", "direction", "receivedAt");
CREATE INDEX "Email_mailboxId_idx" ON "Email"("mailboxId");

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Email" ADD CONSTRAINT "Email_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
