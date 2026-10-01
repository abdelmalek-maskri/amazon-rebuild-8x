# Store

A small Amazon-style store, built in 24 hours for the 8x take-home. It keeps what makes
Amazon familiar (search, filters, the buy box, the basket) and removes what gets in the way:
sponsored results, forced sign in, and pages full of ads.

* **Live site:** <https://amazon-rebuild-8x-five.vercel.app>
* **API health:** <https://amazon-rebuild-8x-production.up.railway.app/health>
* **Agent logs:** every prompt and response is in [`.agent-logs/`](.agent-logs), see [CAPTURE-TEST.md](CAPTURE-TEST.md)

## Try it in two minutes

1. Search for **"phone"** and narrow the results with the filters on the left.
2. Open a product. Use **Add to basket**, or **Buy Now** to pay for just that item.
3. Pay with the test card **4242 4242 4242 4242**, any future date, any CVC.
4. Optional: create an account. Your basket comes with you, and orders show under **Your Orders**.
5. Open the order. You can cancel it for a full refund in the first 30 minutes.

No real money moves. Stripe runs in test mode, and the API refuses to start with a live key.

## What is built

### Shopping

* Home page with departments and product rows
* Search with suggestions as you type, filters with counts, sort and paging
* Product page with a gallery, buy box, stock message and a reviews snapshot
* A basket drawer on desktop, so adding an item never takes you off the page

### Paying and after

* Guest basket, Stripe Checkout, and an order page that waits for the payment to land
* **Buy Now**, which pays for one item and leaves the basket alone
* Cancel and refund before the order ships, with a delivery timeline

### Accounts (optional)

* Sign up, sign in, sign out. A guest basket merges into the account on sign in
* **Your Orders**, a saved list, and reviews that only buyers can write, marked Verified Purchase

## Better than Amazon, on purpose

| What Amazon does today | What this store does |
| --- | --- |
| 6 of the first 22 results were sponsored, including the first 3 | No sponsored results |
| About 30 filter groups, none showing how many results you will get | 5 filter groups, with a result count beside every option except price |
| Product page 17,081px tall with 608 links | One short page: gallery, details, buy box, reviews |
| Add to basket opens a new page with more sponsored products | You stay on the product; a drawer shows the basket |
| Checkout sends a guest straight to a sign in page | Guest checkout. An account is optional |
| A search inside one department that finds nothing is a dead end | One click to search all departments |

## Architecture

### The big picture

```text
Browser ──► web (Next.js 16, Vercel) ──/api/*──► api (Express 5, Railway) ──► Postgres 17
                    │                                   ▲     │
                    └── server components call the API ─┘     └──► Stripe (Checkout, refunds)
                        directly, forwarding cookies                    │
                                                         signed webhook ◄┘
```

Two apps in one repo, deployed separately. There are no npm workspaces: Vercel builds `web/`,
Railway builds `api/`.

**Why a separate API instead of Next.js route handlers?** It costs a second deploy. In return,
the code that handles money never sits next to UI code, and the backend can be tested on its
own against a real database.

**One domain for the browser.** Next.js rewrites `/api/*` to the API. The browser never sees
the Railway URL, so the cart and session cookies are first party, and the API needs no CORS at
all. Server components skip the rewrite and call the API directly with a server only
`API_URL`. They forward only the `session` and `cart_id` cookies, and only when the values look
valid.

### The API: a modular monolith

One process, split into six modules by business area:

| Module | Owns | Endpoints |
| --- | --- | --- |
| catalog | products, categories, search, suggestions | `GET /products`, `/products/:slug`, `/categories`, `/suggestions` |
| cart | baskets and their lines | `GET /cart`, `POST /cart/items`, `PATCH` and `DELETE /cart/items/:id` |
| orders | checkout, Stripe, cancel and refund | `POST /checkout`, `GET /orders`, `/orders/:id`, `POST /orders/:id/cancel`, `/webhooks/stripe` |
| auth | accounts and sessions | `POST /auth/signup`, `/auth/signin`, `/auth/signout`, `GET /auth/me` |
| reviews | reviews and rating totals | `GET` and `POST /products/:slug/reviews`, `GET .../eligibility` |
| wishlist | saved items | `GET /wishlist`, `POST` and `DELETE` items, move to basket |

Every module has the same three files, and each has one job:

* **`routes.ts`** speaks HTTP. It parses the body, query and params with Zod, calls the
  service, and sends the result. Nothing else.
* **`service.ts`** holds the rules. It never sees `req` or `res`, so it can be called from a
  route, a webhook or a test the same way.
* **`repo.ts`** is the only file that queries the database.

Modules talk to each other only through services. For example, reviews asks
`orders/service.hasPaidFor()` whether a shopper bought a product. It never reads the orders
table itself. That keeps each table owned by one module, so it would be straightforward to
split a module out later.

Shared plumbing lives in `api/src/lib/`:

* **`env.ts`** checks every environment variable with Zod at startup and exits on bad
  config. It refuses `sk_live_` keys.
* **`errors.ts`** has `AppError(status, CODE, message)` and one error handler. Every error
  leaves the API as `{ error, message }`, plus `fields` for validation errors. Stack traces and
  SQL never leave the server.
* **`logger.ts`** is pino with a request id on every line. Cookies and auth headers are
  redacted.

Middleware order matters, so here it is:

```text
helmet ─► request logger ─► Stripe webhook (raw body) ─► express.json (100kb) ─► loadUser ─► module routes ─► 404 ─► error handler
```

The webhook sits before `express.json()` because Stripe signs the raw bytes, and a parsed body
can no longer be verified. `loadUser` runs on every request and puts the signed in user on
`res.locals`, so no route ever reads the session cookie itself.

### The data model

Postgres 17 through Drizzle. Seven migrations in `api/drizzle/`, applied on every Railway deploy
before the new version starts.

```text
categories ─< products ─< reviews >─ users ─< sessions
                 │                     │
                 ├─< cart_items >─ carts (user_id unique, null for guests)
                 │                     │
                 ├─< order_items >─ orders >─ users (null for guests)
                 │
                 └─< wishlist_items >─ users
```

The rules live in the database as well as the code, so a bug in the code still can't store bad
data:

* **Money is integer cents.** No floats anywhere.
* **Check constraints:** quantity between 1 and 10, rating between 1 and 5, prices and totals
  not negative.
* **Unique constraints:** one cart line per product, one review per shopper per product, one
  basket per account, one saved item per shopper per product.
* **Order lines copy the title and price** at the moment of purchase. Editing a product later
  never rewrites someone's order history.
* **A product that someone bought can't be deleted** (`on delete restrict`).
* **Raw stock never leaves the API.** Shoppers see `in_stock`, `low_stock` with a count when 5
  or fewer are left, or `out_of_stock`.

### Following one purchase

This is the part that has to be right, so it is worth walking through.

```text
Shopper          web            api                          Postgres        Stripe
  │ Proceed ──►   │ ──POST /checkout──►                          │               │
  │               │               │ lock product rows (id order) ─►              │
  │               │               │ stock short? ─► 409 STOCK_CHANGED            │
  │               │               │ insert pending order, copy prices ─►         │
  │               │               │ create session (key checkout-<orderId>) ────►│
  │ ◄──────────── redirect to Stripe's page ─────────────────────────────────────│
  │ pays ───────────────────────────────────────────────────────────────────────►│
  │               │               │ ◄── checkout.session.completed (signed) ─────│
  │               │               │ one transaction:                             │
  │               │               │   pending ─► paid (only if still pending)    │
  │               │               │   stock = stock − qty where stock >= qty     │
  │               │               │   empty the basket                           │
  │ ◄─ /orders/:id refreshes until it says paid                                  │
```

The decisions behind it:

* **The server works out every number.** Prices and stock are read from locked rows when the
  order is made. Nothing the browser sends about money is trusted.
* **Rows are locked in id order,** so two checkouts that share products can't deadlock.
* **The Stripe call happens outside the transaction.** A slow network call never holds
  database locks. If Stripe fails, the pending order is deleted and the shopper gets a 502.
* **Idempotency keys** (`checkout-<orderId>`, `refund-<orderId>`) mean a retry can never charge
  or refund twice.
* **Stock is taken when payment succeeds, not reserved at checkout.** That is simpler and needs
  no expiry job. The cost is a rare race: two people paying for the last item at the same time.
  The `stock >= qty` guard makes sure only one wins. The other order becomes `needs_refund`
  and is refunded automatically.
* **Duplicate webhooks do nothing,** because an order moves to `paid` only from `pending`.
  Stripe retries webhooks, so this matters.
* **Buy Now** uses the same `startPayment()` with one product and no basket, so the webhook
  leaves the basket alone.

Order states:

```text
pending ─► paid ─► cancelled ─► refunded
   │
   └─► needs_refund ─► refunded        (stock ran out while paying)
```

**Cancel** is allowed while the order is paid and less than 30 minutes old. One transaction
marks it `cancelled` and puts the stock back, then Stripe issues the refund. If Stripe fails,
the order stays `cancelled`, and pressing cancel again only retries the refund.
`charge.refunded` keeps orders in sync with refunds made from Stripe's dashboard.
Shipping and delivery are simulated from `paid_at` and never stored, and the page labels them
"Expected".

### Baskets and accounts

* **A guest basket** is a UUID in an httpOnly `cart_id` cookie, set on the first add. Any value
  that isn't the id of a real cart is treated as no cart.
* **A signed in shopper** has no cart cookie at all. Their basket is found through
  `carts.user_id`.
* **On sign in,** the guest basket merges into the account's, with each line capped by stock and
  the limit of 10. **On sign out,** the account's basket stays, and the guest cookie is cleared.
* Every basket lookup goes through one function, `resolveCartId(userId, cookie)`, so this rule
  lives in exactly one place.

### The web app

Next.js 16 App Router, React 19 and Tailwind 4. The web app holds no business rules: it shows
what the API returns.

* **Server components do the fetching.** All calls go through `web/lib/api.ts`. It gives typed
  functions, one `ApiError` type and a 10 second timeout.
* **Nothing is cached by accident.** Fetches default to `no-store`, because Next would otherwise
  run them once at build time and freeze the result into the page. A web build passes even with
  the API down.
* **Search state lives only in the URL.** Filters are plain links, so they work without
  JavaScript, results can be shared, and the back button works. Bad values in the URL are
  dropped before they reach the API.
* **After any basket change,** the client calls `router.refresh()` and the server re-renders the
  header count and totals. There is no client copy of the basket to drift out of date.
* **Real 404s.** Product pages have no loading skeleton, because streaming fixes the status at
  200 before the page knows the product is missing.
* **The basket drawer is a native `<dialog>`.** The browser handles focus trapping, Escape and
  the inert page behind it.

## Security

| Threat | What stops it |
| --- | --- |
| Tampered prices or totals | The server reads every price and stock level from the database |
| Fake payment confirmation | Webhook signature checked on the raw body |
| Replayed webhooks | An order only moves to `paid` from `pending` |
| Overselling the last item | Row locks, plus a `stock >= qty` guard on the update |
| Stolen session database | Only a SHA-256 hash of each session token is stored |
| Password cracking | argon2id with OWASP settings |
| Finding out who has an account | Same answer and same timing for a wrong password and an unknown email |
| Guessing passwords | Sign in limited to 10 per 15 minutes, sign up to 5 per hour |
| Seeing another shopper's basket line or order | 404, not 403, so nothing leaks |
| Cross-site requests | httpOnly, SameSite=Lax cookies, JSON only, no CORS |
| Session fixation | A new session token on every sign in |
| Open redirects after sign in | `safeNext()` only allows paths on this site |
| Leaking internals | One error shape, no stack traces or SQL, cookies redacted in logs |

Sessions are stored in the database rather than in a JWT, so signing out really ends them.

## Quality

* **131 API tests** with Vitest and Supertest, against a real Postgres database that is rebuilt
  before every run. Stripe's network calls are mocked, but webhook signatures are verified for
  real.
* **What the tests cover:** checkout totals, stock races, duplicate webhooks, bad signatures,
  refunds, basket merging, access to other people's orders, rate limits and schema constraints.
* **Real payments through Stripe's test page,** checked end to end on the live site.
* **Lighthouse** (live site and local production builds): performance 95 to 99, accessibility 100, best practices 100.
* **Checked at 375px and 1280px,** with no sideways scrolling on any page.

## Known limits

Things I would change before real traffic:

* **Rate limits are kept in memory.** They reset on deploy and don't work across more than one
  API instance. Redis would fix both.
* **Rate limits count the Vercel server, not the shopper.** All requests reach the API through
  Vercel, so every shopper shares one limit. The web app should forward the shopper's IP with a
  shared secret.
* **There are no emails.** Order confirmations and password resets need an email provider.
* **Shipping is simulated** from the payment time.
* **Product data is a saved snapshot of DummyJSON** (184 products, 7 departments), so seeding
  never depends on a third party. Its weights and sizes are random, so they aren't shown.

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
web/app/          pages (App Router)
web/components/   UI, grouped by feature; base components in ui/, shown on /design
web/lib/          API client, URL parsing, formatting
api/src/modules/  catalog, cart, orders, auth, reviews, wishlist
api/src/lib/      env, errors, logger, Stripe client
api/drizzle/      database migrations
api/data/         the product snapshot used by the seed
api/test/         API tests
.agent-logs/      captured agent prompts and responses
```

## How I worked

I built this with Claude Code, one small ticket at a time from a Trello board. Each ticket was
reviewed and merged as its own pull request. Every prompt and reply is captured in
`.agent-logs/`, including the wrong turns and the bugs found along the way.
