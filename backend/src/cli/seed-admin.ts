/**
 * Bootstrap the first owner account.
 *
 * Usage:
 *   bun src/cli/seed-admin.ts \
 *     --email admin@example.com \
 *     --name "Admin" \
 *     --password 'StrongP@ssw0rd!'
 *
 * Idempotent — re-running with the same email updates the password and ensures
 * the user has the `owner` role. Safe for re-runs after a forgotten password.
 */
import { hashPassword } from "@/core/crypto";
import { prisma } from "@/core/db";
import { logger } from "@/core/logger";

type Args = { email?: string; name?: string; password?: string };

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    const next = argv[i + 1];
    if (arg === "--email" && next) {
      out.email = next.toLowerCase();
      i++;
    } else if (arg === "--name" && next) {
      out.name = next;
      i++;
    } else if (arg === "--password" && next) {
      out.password = next;
      i++;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password || !args.name) {
    logger.error("usage: bun src/cli/seed-admin.ts --email <email> --name <name> --password <password>");
    process.exit(1);
  }

  const passwordHash = await hashPassword(args.password);

  const user = await prisma.user.upsert({
    where: { email: args.email },
    update: {
      name: args.name,
      passwordHash,
      emailVerified: true,
      status: "active",
    },
    create: {
      email: args.email,
      name: args.name,
      passwordHash,
      emailVerified: true,
      status: "active",
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: "owner" } },
    update: {},
    create: { userId: user.id, role: "owner" },
  });

  logger.info({ id: user.id, email: user.email }, "owner account ready");
  await prisma.$disconnect();
}

void main().catch(async (err) => {
  logger.error({ err }, "seed failed");
  await prisma.$disconnect();
  process.exit(1);
});
