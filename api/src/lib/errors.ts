import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = () => {
  throw new AppError(404, "NOT_FOUND", "We couldn't find that.");
};

// body-parser marks its own failures with `type` and `status`; everything else unknown is a 500.
type BodyParserError = { type?: string; status?: number };

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Some of the details you sent aren't valid.",
      fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  const { type, status } = err as BodyParserError;
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: "INVALID_JSON", message: "The request body isn't valid JSON." });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ error: "PAYLOAD_TOO_LARGE", message: "The request is too large." });
    return;
  }
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: "BAD_REQUEST", message: "The request couldn't be processed." });
    return;
  }
  req.log.error({ err }, "unhandled error");
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again." });
};
