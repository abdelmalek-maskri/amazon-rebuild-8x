import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

// Without a listener, an idle client losing its connection would crash the process
pool.on("error", (err) => logger.error({ err }, "idle database client error"));

export const db = drizzle({ client: pool, schema });
