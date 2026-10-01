import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { OrderSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { getServerOrders } from "@/lib/server-session";

export const metadata: Metadata = { title: "Your Orders", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const raw = (await searchParams).page;
  const page = typeof raw === "string" && /^\d{1,3}$/.test(raw) && Number(raw) >= 1 ? Number(raw) : 1;
  const orders = await getServerOrders(page);
  if (!orders) redirect(`/signin?next=${encodeURIComponent("/orders")}`);

  const last = Math.max(1, Math.ceil(orders.total / orders.pageSize));

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-6 pb-12 sm:px-4">
      <h1 className="text-3xl font-medium">Your Orders</h1>
      <p className="mt-1 text-sm text-muted">
        {orders.total === 0 ? "No orders yet." : `${orders.total} ${orders.total === 1 ? "order" : "orders"} placed`}
      </p>

      {orders.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="You haven't placed any orders yet"
          message="Orders you place while signed in show up here."
          action={<ButtonLink href="/">Start shopping</ButtonLink>}
        />
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {orders.items.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}

      {last > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/orders?page=${page - 1}`} className="rounded-lg border border-border px-4 py-2 hover:bg-page">
              ‹ Newer
            </Link>
          )}
          {page < last && (
            <Link href={`/orders?page=${page + 1}`} className="rounded-lg border border-border px-4 py-2 hover:bg-page">
              Older ›
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

// Amazon's order card: a grey summary strip, then what was bought.
function OrderCard({ order }: { order: OrderSummary }) {
  const ref = order.id.slice(0, 8).toUpperCase();
  return (
    <li className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-2 bg-page px-4 py-3 text-xs text-muted">
        <div>
          <p className="uppercase">Order placed</p>
          <p className="text-sm text-ink">{dateFormat.format(new Date(order.createdAt))}</p>
        </div>
        <div>
          <p className="uppercase">Total</p>
          <p className="text-sm text-ink">{formatPrice(order.totalCents)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="uppercase">Order # {ref}</p>
          <Link href={`/orders/${order.id}`} className="inline-flex min-h-11 items-center text-sm text-link hover:text-link-hover hover:underline md:min-h-0">
            View order details
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className={cn("font-bold", order.status === "paid" ? "text-success" : "text-warning")}>{statusLabel(order)}</p>
        <ul className="flex flex-col gap-3">
          {order.lines.map((l) => (
            <li key={l.product.slug} className="flex items-center gap-3">
              <Link href={`/products/${l.product.slug}`} className="relative size-16 shrink-0 overflow-hidden rounded bg-page">
                <Image src={l.product.imageUrl} alt="" fill sizes="64px" className="object-contain p-1 mix-blend-multiply" />
              </Link>
              <div className="min-w-0">
                <Link href={`/products/${l.product.slug}`} className="line-clamp-2 text-sm text-link hover:text-link-hover">
                  {l.title}
                </Link>
                {l.quantity > 1 && <p className="text-xs text-muted">Qty {l.quantity}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function statusLabel(order: OrderSummary) {
  if (order.status === "paid") return order.fulfilment === "delivered" ? "Delivered" : order.fulfilment === "shipped" ? "Shipped" : "Preparing to ship";
  if (order.status === "cancelled") return "Cancelled, refund pending";
  if (order.status === "refunded") return "Refunded";
  return "Couldn't be completed, being refunded";
}
