import { PrismaClient } from "@prisma/client";
import { config } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __mzpPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__mzpPrisma ??
  new PrismaClient({
    log: config.env === "development" ? ["warn", "error"] : ["error"],
  });

if (config.env !== "production") globalThis.__mzpPrisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
