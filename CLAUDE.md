# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Amazon inspired store built for the 8x take home (24 hours, judged on speed, product
judgement and UX). It should feel like Amazon but with better UX: no ads, no forced sign in,
no clutter. Built in layers; each layer is deployed and working before the next starts.

1. Home with search and categories, search with filters, product page, guest cart,
   Stripe Checkout (test mode), order page.
2. Optional sign up and sign in (guest checkout stays), order history, reviews with a star
   breakdown, Amazon style header with account menu and basket count, Buy Now.
3. If time: AI review summary where every point shows a count and links to its reviews,
   then verified purchase badges, then wish list.

Work one step at a time; the user reviews every change before the next.

## Agent capture (do not break)

`.claude/settings.json` wires `.claude/hooks/capture.py` to SessionStart, UserPromptSubmit
and Stop. It appends every prompt and final response to `.agent-logs/`. Never edit, delete
or gitignore anything in `.agent-logs/`, and do not modify the hook files. Commit the logs
together with the code they produced. `CAPTURE-TEST.md` documents the setup.

## Commands

```bash
docker compose up -d --wait     # local Postgres 17 on localhost:5433 (5432 is taken by a host Postgres)

cd web && cp .env.example .env.local  # first time only; next.config.ts throws without API_URL
cd web && npm run dev           # Next.js on :3000
cd web && npm run build
cd web && npm run lint

cd api && cp .env.example .env  # first time only
cd api && npm run dev           # Express on :4000, pretty logs
cd api && npm run typecheck
cd api && npm test              # Vitest + Supertest against the store_test database
cd api && npx vitest run test/app.test.ts -t "404"   # one file, one test
cd api && npm run db:generate   # SQL migration from src/db/schema.ts into api/drizzle/
cd api && npm run db:migrate    # applies api/drizzle/ with src/db/migrate.ts (not drizzle-kit migrate)
cd api && npm run db:seed       # inserts missing categories/products from api/data/products.json
```

Deploys: Railway builds `api/` with `npm run build`, runs `npm run db:deploy` (migrate, then
seed) as the pre-deploy command, then `npm start`. Vercel builds `web/` and needs `API_URL` at build time,
because the rewrite is fixed when `next build` runs.

`store_test` is created by `docker/init.sql`, which only runs when the Docker volume is new
(`docker compose down -v` to recreate). `test/global-setup.ts` drops and re-migrates it before
every run; test files run serially and call `resetDb()` from `test/helpers.ts`. Env vars already
set win over `api/.env`, so tests never touch the dev database.

Catalogue data: `api/data/products.json` is a committed snapshot of DummyJSON (made by
`api/scripts/snapshot-products.ts`), folded into 7 departments. The seed only inserts missing rows,
so it runs on every deploy without resetting stock. `rating_avg`/`rating_count` are derived from
the snapshot's reviews, not DummyJSON's own rating field.

## Architecture

Two apps, one repo, no npm workspaces (Vercel builds `web/`, Railway builds `api/`).

* `web/`: Next.js 16 App Router, React 19, Tailwind 4, TypeScript. UI only: it never
  computes prices, totals or stock. Next 16 has breaking changes; read the guides in
  `web/node_modules/next/dist/docs/` before writing web code (see `web/AGENTS.md`).
  All API calls go through `web/lib/api.ts` (typed functions, `ApiError`, 10s timeout); it
  defaults to `cache: "no-store"` because an uncached `fetch` is otherwise run once at build
  time and frozen into the page. Prices render only through `formatPrice(cents)` in
  `web/lib/format.ts` (or the `Price` component, which uses it).
  UI: Amazon's palette lives as tokens in `web/app/globals.css` (`@theme static`, so every
  `--color-*` exists even before a class uses it); use `bg-cta`, `text-link` and so on, never raw
  hex. Base components are in `web/components/ui/` and all appear on `/design` (not linked from the
  store) for checking at 375px and 1280px. `useToast()` needs the `ToastProvider` in the root
  layout. Product images must come from `cdn.dummyjson.com` (`images.remotePatterns`); use
  `preload`, not the deprecated `priority`, on above-the-fold images.
* `api/`: Express 5, TypeScript, Zod, Drizzle, Postgres. A modular monolith with modules in
  `api/src/modules/` (`catalog`, `cart`, `orders`; Stripe lives in `orders`). Each module has
  `routes.ts` (HTTP and Zod validation only), `service.ts` (business rules, never sees req or
  res) and `repo.ts` (the only place that queries the database). Modules call each other only
  through services. `app.ts` builds the app so tests can import it; `server.ts` listens.
  Shared plumbing is in `api/src/lib/`: `env.ts` (Zod checked env, exits on bad config),
  `logger.ts` (pino, request id), `errors.ts`. Throw `AppError(status, CODE, message)` or let
  Zod throw; the one error handler turns everything into `{ error, message }` and never leaks
  internals. ESM with `nodenext`, so relative imports end in `.js`.
  Routes parse `req.query`/`req.params` with a Zod schema (`.parse`, so failures become 400 with
  `fields`). Prices in query strings are integer cents. Products never expose raw `stock`: the
  catalog service maps it to `availability` (`in_stock`, `low_stock` with `left` when 5 or fewer,
  `out_of_stock`). List endpoints return `{ items, total, page, pageSize }`; `GET /products` also
  returns `facets`, where each facet's counts ignore that facet's own filter. Search escapes
  `%`/`_` before `ILIKE`.

Request path: the browser only talks to the web domain. Next.js rewrites `/api/*` to the API,
so cookies are first party and the API does not enable CORS. Server components call the API
directly through the server only `API_URL`.

Money and trust rules:

* Money is integer cents everywhere. The server loads prices and stock from the database;
  never trust amounts from the browser.
* Checkout creates a `pending` order with copied prices, then a Stripe Checkout Session.
  The signed Stripe webhook marks it `paid` only if still `pending` (duplicate webhooks do
  nothing), decrements stock with a `stock >= qty` guard and empties the cart, in one
  transaction. If stock ran out meanwhile the order becomes `needs_refund`.
* Guests are identified by an httpOnly cart cookie; orders are reached by their UUID.
