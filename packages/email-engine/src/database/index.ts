import { prisma } from "./client";

export const database = {
  customer: prisma.customer,
  emailHistory: prisma.emailHistory,
  mailbox: prisma.mailbox
};
