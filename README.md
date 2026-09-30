# Store

A small Amazon inspired store built for the 8x take home. One buying path done properly:
search with filters, product page, guest cart, Stripe test checkout, order page.

## Structure

```
web/           Next.js storefront (Vercel)
api/           Express API, modular monolith (Railway)
.agent-logs/   Captured agent prompts and responses, see CAPTURE-TEST.md
```

The browser only talks to the web domain. Next.js forwards `/api/*` to the API.

## Run locally

Needs Node 22 and Docker.

```
docker compose up -d        # Postgres on localhost:5433
cd api && npm install && npm run dev
cd web && npm install && npm run dev
```

Open http://localhost:3000.
