ALTER TABLE "Customer" ADD COLUMN "preferences" JSONB, ADD COLUMN "notes" TEXT, ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Quote" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN "followUpAt" TIMESTAMP(3), ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "parentQuoteId" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "QuoteItem" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Employee" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE', ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Attendance" ADD COLUMN "checkIn" TIMESTAMP(3), ADD COLUMN "checkOut" TIMESTAMP(3), ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECORDED', ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "Onboarding" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "currentStep" INTEGER NOT NULL DEFAULT 1, "completed" BOOLEAN NOT NULL DEFAULT false, "modules" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AIConfiguration" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "tone" TEXT NOT NULL DEFAULT 'professionale', "language" TEXT NOT NULL DEFAULT 'it', "signature" TEXT, "instructions" TEXT, "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false, "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AIConfiguration_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AutomationRuleRecord" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "trigger" TEXT NOT NULL, "actions" TEXT[], "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AutomationRuleRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Order" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "quoteId" TEXT NOT NULL, "number" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CONFIRMED', "total" DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Order_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Ticket" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "customerId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Report" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "type" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL, "data" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Report_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "Onboarding_companyId_key" ON "Onboarding"("companyId");
CREATE UNIQUE INDEX "AIConfiguration_companyId_key" ON "AIConfiguration"("companyId");
CREATE INDEX "AutomationRuleRecord_companyId_trigger_enabled_idx" ON "AutomationRuleRecord"("companyId", "trigger", "enabled");
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");
CREATE UNIQUE INDEX "Order_companyId_number_key" ON "Order"("companyId", "number");
CREATE INDEX "Ticket_companyId_status_idx" ON "Ticket"("companyId", "status");
CREATE INDEX "Report_companyId_type_createdAt_idx" ON "Report"("companyId", "type", "createdAt");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_parentQuoteId_fkey" FOREIGN KEY ("parentQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIConfiguration" ADD CONSTRAINT "AIConfiguration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRuleRecord" ADD CONSTRAINT "AutomationRuleRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;