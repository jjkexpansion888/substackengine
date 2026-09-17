import { PrismaClient } from "@prisma/client";

// One PrismaClient per process; Next.js dev hot-reloads would otherwise open
// a connection pool per reload (the classic Next + Prisma leak).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
