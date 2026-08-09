import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as unknown as { database?: PrismaClient };

export const database = globalDatabase.database ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalDatabase.database = database;

export * from "@prisma/client";