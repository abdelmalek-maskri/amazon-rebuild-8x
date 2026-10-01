import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { closeServers, serve } from "./helpers.js";
import { pool } from "../src/db/index.js";

const app = serve();

afterAll(async () => {
  await closeServers();
  await pool.end();
});

describe("app skeleton", () => {
  it("reports health with the database connected", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns 404 in the standard error shape", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND", message: expect.any(String) });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/health").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it("rejects bodies over 100kb with 413", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(110_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
