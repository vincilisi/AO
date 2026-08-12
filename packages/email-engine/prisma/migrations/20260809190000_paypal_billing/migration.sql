DROP INDEX IF EXISTS "Subscription_stripeCustomerId_key";
DROP INDEX IF EXISTS "Subscription_stripeSubscriptionId_key";
DROP INDEX IF EXISTS "Subscription_stripeCheckoutSessionId_key";

ALTER TABLE "Subscription"
DROP COLUMN IF EXISTS "stripeCustomerId",
DROP COLUMN IF EXISTS "stripeSubscriptionId",
DROP COLUMN IF EXISTS "stripeCheckoutSessionId",
ADD COLUMN "paypalPlanId" TEXT,
ADD COLUMN "paypalSubscriptionId" TEXT,
ADD COLUMN "paypalPayerId" TEXT;

CREATE UNIQUE INDEX "Subscription_paypalSubscriptionId_key" ON "Subscription"("paypalSubscriptionId");