import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../lib/logger.js";
import { db, pool } from "./index.js";

// Runs as Railway's pre-deploy command, so production needs no drizzle-kit. Resolves to api/drizzle
// from both src/db (tsx) and dist/db (compiled).
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

try {
  // Connect first so a wrong DATABASE_URL fails the deploy here, even when there is nothing to apply.
  await pool.query("select 1");
  // drizzle-kit only writes the journal with the first generated migration.
  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
    logger.info({ migrationsFolder }, "no migrations yet, nothing to apply");
  } else {
    await migrate(db, { migrationsFolder });
    logger.info("migrations applied");
  }
} catch (err) {
  logger.error({ err }, "migration failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
