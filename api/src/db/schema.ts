import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Column names come from the camelCase keys via `casing: "snake_case"` (db/index.ts, drizzle.config.ts).
const id = () => uuid().primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const categories = pgTable("categories", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  ...timestamps,
});

export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    description: text().notNull(),
    brand: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    priceCents: integer().notNull(),
    stock: integer().notNull(),
    imageUrl: text().notNull(),
    images: text().array().notNull().default(sql`'{}'::text[]`),
    // Denormalised from reviews so search can filter and sort by rating without a join.
    ratingAvg: real().notNull().default(0),
    ratingCount: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check("products_price_cents_nonnegative", sql`${t.priceCents} >= 0`),
    check("products_stock_nonnegative", sql`${t.stock} >= 0`),
    check("products_rating_avg_range", sql`${t.ratingAvg} between 0 and 5`),
    check("products_rating_count_nonnegative", sql`${t.ratingCount} >= 0`),
    index("products_category_id_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brand),
    index("products_price_cents_idx").on(t.priceCents),
    index("products_rating_avg_idx").on(t.ratingAvg),
  ],
);

export const users = pgTable("users", {
  id: id(),
  // Stored lower cased and trimmed, so "Ada@X.com" and "ada@x.com" are one account.
  email: text().notNull().unique(),
  name: text().notNull(),
  // argon2id; the password itself is never stored or logged.
  passwordHash: text().notNull(),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the cookie token: a leaked database row can't be replayed as a session.
    tokenHash: text().notNull().unique("sessions_token_hash_unique"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const carts = pgTable("carts", {
  id: id(),
  // Null for guests. Unique: a signed in shopper has exactly one basket, on every device.
  userId: uuid()
    .unique("carts_user_id_unique")
    .references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    check("cart_items_quantity_range", sql`${t.quantity} between 1 and 10`),
    // Also serves as the cart_id index: it is the leading column.
    unique("cart_items_cart_id_product_id_unique").on(t.cartId, t.productId),
    index("cart_items_product_id_idx").on(t.productId),
  ],
);

// pending -> paid -> cancelled -> refunded, or needs_refund -> refunded. Shipping is simulated
// from paid_at (see orders/service.ts), so it isn't a stored state.
export const orderStatus = pgEnum("order_status", ["pending", "paid", "needs_refund", "cancelled", "refunded"]);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    status: orderStatus().notNull().default("pending"),
    // Set null rather than cascade: an order outlives the cart it came from.
    cartId: uuid().references(() => carts.id, { onDelete: "set null" }),
    // Null for guest orders, which are reached by their link alone. Set: only that account may open it.
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    // Filled from the Stripe session once the shopper pays.
    email: text(),
    totalCents: integer().notNull(),
    stripeSessionId: text().unique("orders_stripe_session_id_unique"),
    // What a refund is issued against; set when the payment succeeds.
    stripePaymentIntentId: text(),
    stripeRefundId: text(),
    paidAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    refundedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("orders_total_cents_nonnegative", sql`${t.totalCents} >= 0`),
    index("orders_cart_id_idx").on(t.cartId),
    // Serves "Your Orders", newest first.
    index("orders_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Restrict: a product someone bought can never be deleted out from under their order.
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    // Copied at purchase so later price or title edits never rewrite history.
    title: text().notNull(),
    unitPriceCents: integer().notNull(),
    quantity: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    check("order_items_unit_price_cents_nonnegative", sql`${t.unitPriceCents} >= 0`),
    check("order_items_quantity_range", sql`${t.quantity} between 1 and 10`),
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_product_id_idx").on(t.productId),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    // Cascade: reviews mean nothing without their product.
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    body: text().notNull(),
    authorName: text().notNull(),
    // Null for seeded reviews. Set null if the account goes: the review stays, the link to it doesn't.
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    // True only when written by someone with a paid order for this product (checked when written).
    verified: boolean().notNull().default(false),
    // When the review was written, which is what shoppers see; created_at is when the row was stored.
    reviewedAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
    // One review per shopper per product. Seeded reviews have no user, and nulls never clash.
    unique("reviews_product_id_user_id_unique").on(t.productId, t.userId),
    // Serves the product's list, newest first, and the per-star breakdown.
    index("reviews_product_id_reviewed_at_idx").on(t.productId, t.reviewedAt),
  ],
);
