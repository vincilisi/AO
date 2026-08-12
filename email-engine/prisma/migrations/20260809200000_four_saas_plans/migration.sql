UPDATE "Subscription" SET "planCode" = 'BASE' WHERE "planCode" = 'PRIVATE';
UPDATE "Subscription" SET "planCode" = 'BUSINESS' WHERE "planCode" = 'SMALL_BUSINESS';