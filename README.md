# Store

A small Amazon inspired store built for the 8x take home. It keeps what makes Amazon
familiar and drops what gets in the way: no ads, no forced sign in, no clutter.

* **Live site:** <https://amazon-rebuild-8x-five.vercel.app>
* **API:** <https://amazon-rebuild-8x-production.up.railway.app/health>

## Structure

```text
web/           Next.js storefront (Vercel)
api/           Express API, modular monolith (Railway, with Postgres)
.agent-logs/   Captured agent prompts and responses, see CAPTURE-TEST.md
```

The browser only talks to the web domain. Next.js forwards `/api/*` to the API.

## Run locally

Needs Node 22 and Docker.

```bash
docker compose up -d --wait          # Postgres on localhost:5433
cd api && cp .env.example .env && npm install && npm run db:migrate && npm run dev
cd web && cp .env.example .env.local && npm install && npm run dev
```

Open http://localhost:3000. Run the API tests with `cd api && npm test`.
