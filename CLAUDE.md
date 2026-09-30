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

```
docker compose up -d --wait     # local Postgres 17 on localhost:5433 (5432 is taken by a host Postgres)

cd web && npm run dev           # Next.js on :3000
cd web && npm run build
cd web && npm run lint
```

`api/` has folders only so far. Its commands will be added here when `api/package.json` exists.

## Architecture

Two apps, one repo, no npm workspaces (Vercel builds `web/`, Railway builds `api/`).

* `web/`: Next.js 16 App Router, React 19, Tailwind 4, TypeScript. UI only: it never
  computes prices, totals or stock. Next 16 has breaking changes; read the guides in
  `web/node_modules/next/dist/docs/` before writing web code (see `web/AGENTS.md`).
* `api/`: Express 5, TypeScript, Zod, Drizzle, Postgres. A modular monolith with modules in
  `api/src/modules/` (`catalog`, `cart`, `orders`; Stripe lives in `orders`). Each module has
  `routes.ts` (HTTP and Zod validation only), `service.ts` (business rules, never sees req or
  res) and `repo.ts` (the only place that queries the database). Modules call each other only
  through services. `app.ts` builds the app so tests can import it; `server.ts` listens.

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
