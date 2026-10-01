# Store

A small Amazon-style store, built in 24 hours for the 8x take-home. It keeps what makes
Amazon familiar (search, filters, the buy box, the basket) and removes what gets in the way:
sponsored results, forced sign in, and pages full of ads.

* **Live site:** <https://amazon-rebuild-8x-five.vercel.app>
* **API health:** <https://amazon-rebuild-8x-production.up.railway.app/health>
* **Agent logs:** every prompt and response is in [`.agent-logs/`](.agent-logs), see [CAPTURE-TEST.md](CAPTURE-TEST.md)

> **Screenshot to add:** home page at desktop width (`docs/screenshots/home.png`)

## Try it in two minutes

1. Search for **"phone"** and narrow the results with the filters on the left.
2. Open a product. Use **Add to basket**, or **Buy Now** to pay for just that item.
3. Pay with the test card **4242 4242 4242 4242**, any future date, any CVC.
4. Optional: create an account. Your basket comes with you, and orders show under **Your Orders**.

No real money moves. Stripe runs in test mode, and the API refuses to start with a live key.

## What is built

### The buying path

* Home page with departments and product rows
* Search with suggestions as you type, filters with counts, sort and paging
* Product page with gallery, buy box, stock message and customer reviews
* Guest basket, Stripe Checkout, and an order page that confirms the payment

### The Amazon feel

* Optional accounts: sign up, sign in, sign out
* The basket follows the account, and a guest basket merges in on sign in
* Order history under **Your Orders**
* Header with "Hello, name", an account menu and a live basket count
* **Buy Now**, which goes straight to payment and leaves the basket alone

### Not built yet

An AI review summary, verified purchase badges and a wish list. These were
planned last on purpose, so the core path could be finished properly first.

> **Screenshots to add:**
> search results with filters (`docs/screenshots/search.png`),
> product page with the buy box and reviews (`docs/screenshots/product.png`)

## Better than Amazon, on purpose

I went through amazon.co.uk as a guest on 30 September 2026 and noted what slowed me down.
Each row below is a choice made in this store because of what I saw.

| What Amazon does today | What this store does |
| --- | --- |
| 6 of the first 22 results were sponsored, including the first 3 | No sponsored results |
| About 30 filter groups, none showing how many results you will get | 5 filter groups, with a result count beside every option except price |
| Product page 17,081px tall with 608 links | One short page: gallery, details, buy box, reviews |
| Add to basket opens a new page with more sponsored products | You stay on the product; a small message confirms it |
| Checkout sends a guest straight to a sign in page | Guest checkout. An account is optional |
| Hero carousel cuts headlines mid word | No carousel. A grid that reflows on every screen size |
| A search inside one department that finds nothing is a dead end | One click to search all departments |

> **Screenshots to add:**
> basket with "Customers also viewed" (`docs/screenshots/basket.png`),
> order confirmation and Your Orders (`docs/screenshots/orders.png`),
> the same pages on a phone (`docs/screenshots/mobile.png`)

## How it works

```text
Browser ──► web (Next.js, Vercel) ──/api/*──► api (Express, Railway) ──► Postgres
                                                     │
                                                     └──► Stripe Checkout, and its signed webhook back
```

* **The browser only talks to one domain.** Next.js forwards `/api/*` to the API, so cookies
  stay first party and the API needs no CORS.
* **The API is a modular monolith.** Five modules (catalog, cart, reviews, auth, orders), each
  split into routes (HTTP and validation), a service (the rules) and a repo (the database).
* **The web app holds no business rules.** It shows what the API says. Prices, totals and stock
  are only ever worked out on the server.

## Decisions worth knowing

* **A separate API instead of Next.js route handlers.** It costs a second deploy, but keeps
  money logic away from UI code and makes the backend testable on its own.
* **The server owns every number.** Prices are integer cents, read from the database at the
  moment of checkout. A price change after "Add to basket" is what gets charged.
* **Stock is taken when payment succeeds, not reserved at checkout.** Simpler, and safe: if an
  item sells out during the 30 minute payment window, the order is flagged `needs_refund`
  instead of overselling. There is no automatic refund yet.
* **Sessions live in the database, not in a JWT,** so signing out really ends them.
* **Product data is a saved snapshot of DummyJSON** (184 products, 7 departments), so seeding
  never depends on a third party. Its weights and sizes turned out to be random, so they are
  not shown. Ratings are worked out from the reviews actually stored, so stars and reviews
  always agree.

## Security

* Every input is checked with Zod: bodies, query strings and URL parameters.
* Stripe webhooks are verified against their signature. A repeated webhook changes nothing.
* Stock changes lock the product row, so two shoppers can never buy the last item twice.
* Passwords use argon2id. Only a hash of the session token is stored.
* Sign in gives the same answer, in the same time, for a wrong password and an unknown email.
* Sign in and sign up are rate limited.
* Another shopper's basket line or order returns 404, not 403, so nothing leaks.
* Cookies are httpOnly and SameSite=Lax. The API accepts only JSON and has no CORS.
* Errors never show stack traces or SQL. Every error has the same shape: `{ error, message }`.

## Quality

* **102 API tests** against a real Postgres database. Stripe's network call is mocked, but
  webhook signatures are verified for real.
* **Real payments through Stripe's test page,** checked end to end on the live site.
* **Lighthouse** (live site and local production builds): performance 95 to 99, accessibility 100,
  best practices 100.
* **Checked at 375px and 1280px:** no sideways scrolling on any page.
* **A web build never depends on the API being up.** It passes with the API unreachable.

## Run it locally

You need Node 22, Docker and the Stripe CLI.

```bash
docker compose up -d --wait                 # Postgres on localhost:5433

cd api
cp .env.example .env                        # add your sk_test_ key
npm install && npm run db:migrate && npm run db:seed
stripe listen --forward-to localhost:4000/webhooks/stripe   # put its whsec_ secret in .env
npm run dev                                 # API on :4000

cd ../web
cp .env.example .env.local
npm install && npm run dev                  # site on :3000
```

Run the API tests with `cd api && npm test`.

## Project layout

```text
web/           Next.js storefront (App Router, Tailwind)
api/           Express API: src/modules/{catalog,cart,reviews,auth,orders}
api/data/      the product snapshot used by the seed
api/drizzle/   database migrations
.agent-logs/   captured agent prompts and responses
```

## How I worked

I built this with Claude Code, one small ticket at a time from a Trello board. Each ticket was
reviewed and merged as its own pull request. Every prompt and reply is captured in
`.agent-logs/`, including the wrong turns and the bugs found along the way.
