// scripts/db-full-reset.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

async function main() {
  const prisma = getPrismaInstance();

  try {
    console.log("Ensuring extension 'vector' exists...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("Extension 'vector' ensured.");

    console.log("\nResetting and reapplying migrations...");
    // Reaplica TODAS as migrations + seed (por causa do prisma.config.ts)
    execSync(`npx prisma migrate reset --force`, { stdio: "inherit" });

    console.log("\n✅ Database fully reset and migrations applied.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
