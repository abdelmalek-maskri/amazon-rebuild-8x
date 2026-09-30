import { createApp } from "./app.js";
import { pool } from "./db/index.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, "api listening"));

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  // Hard stop if in-flight requests or the pool hang; Railway kills the container soon after anyway.
  setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();

  server.close((err) => {
    if (err) logger.error({ err }, "error closing http server");
    pool.end().then(
      () => process.exit(err ? 1 : 0),
      (poolErr) => {
        logger.error({ err: poolErr }, "error closing database pool");
        process.exit(1);
      },
    );
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
