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
  // Railway's health check hits /health every few seconds; only log it when it fails.
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return req.url === "/health" ? "silent" : "info";
  },
  // One short line per request. Headers are left out on purpose: they are noisy and can carry secrets.
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
