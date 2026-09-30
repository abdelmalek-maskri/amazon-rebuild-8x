import { randomUUID } from "node:crypto";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
});

export const httpLogger = pinoHttp({
  logger,
  // Always generate our own id: a client supplied one could be forged or used to inject log lines.
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
});
