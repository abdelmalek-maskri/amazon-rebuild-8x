import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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

export const carts = pgTable("carts", {
  id: id(),
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

export const orderStatus = pgEnum("order_status", ["pending", "paid", "needs_refund"]);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    status: orderStatus().notNull().default("pending"),
    // Set null rather than cascade: an order outlives the cart it came from.
    cartId: uuid().references(() => carts.id, { onDelete: "set null" }),
    // Filled from the Stripe session once the shopper pays.
    email: text(),
    totalCents: integer().notNull(),
    stripeSessionId: text().unique("orders_stripe_session_id_unique"),
    paidAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("orders_total_cents_nonnegative", sql`${t.totalCents} >= 0`),
    index("orders_cart_id_idx").on(t.cartId),
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
