import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CancelButton } from "@/components/order/cancel-button";
import { PendingRefresh } from "@/components/order/pending-refresh";
import { RetryRefund } from "@/components/order/retry-refund";
import { Timeline } from "@/components/order/timeline";
import { ButtonLink } from "@/components/ui/button";
import { ApiError, type Order } from "@/lib/api";
import { getServerOrder, getServerUser } from "@/lib/server-session";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

const loadOrder = cache(async (id: string) => {
  try {
    return await getServerOrder(id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
});

// A short, readable reference; the full UUID stays in the URL, where it acts as the access key.
const reference = (id: string) => id.slice(0, 8).toUpperCase();

export async function generateMetadata({ params }: PageProps<"/orders/[id]">): Promise<Metadata> {
  const order = await loadOrder((await params).id);
  return { title: order ? `Order ${reference(order.id)}` : "Order not found", robots: { index: false } };
}

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const [order, user] = await Promise.all([loadOrder((await params).id), getServerUser()]);
  if (!order) notFound();

  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="flex-1 bg-page pb-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
        <StatusBanner order={order} />

        {order.paidAt && (
          <section aria-labelledby="tracking" className="flex flex-col gap-4 bg-surface p-4 sm:flex-row sm:justify-between sm:p-6">
            <div>
              <h2 id="tracking" className="mb-3 text-lg font-bold">
                Tracking
              </h2>
              <Timeline steps={order.steps} />
              {order.fulfilment && <p className="mt-3 text-xs text-muted">Shipping is simulated in this demo.</p>}
            </div>
            {order.canCancel && order.cancelBy && <CancelButton orderId={order.id} totalCents={order.totalCents} cancelBy={order.cancelBy} />}
            {/* A cancelled order whose refund failed: the same action retries just the refund. */}
            {order.status === "cancelled" && <RetryRefund orderId={order.id} />}
          </section>
        )}

        <section aria-labelledby="items" className="bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
            <h2 id="items" className="text-lg font-bold">
              Order {reference(order.id)}
            </h2>
            <p className="text-sm text-muted">
              Placed {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(order.createdAt))}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {order.items.map((i) => (
              <li key={i.product.slug} className="flex items-center gap-4 py-4">
                <Link href={`/products/${i.product.slug}`} className="relative size-20 shrink-0 overflow-hidden rounded bg-page">
                  <Image src={i.product.imageUrl} alt="" fill sizes="80px" className="object-contain p-2 mix-blend-multiply" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${i.product.slug}`} className="line-clamp-2 hover:text-link-hover">
                    {i.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {i.quantity} × {formatPrice(i.unitPriceCents)}
                  </p>
                </div>
                <p className="font-bold">{formatPrice(i.lineTotalCents)}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-border pt-3 text-right text-lg">
            Order total ({itemCount} {itemCount === 1 ? "item" : "items"}): <strong>{formatPrice(order.totalCents)}</strong>
          </p>
        </section>

        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/">Continue shopping</ButtonLink>
          {user && (
            <ButtonLink href="/orders" variant="secondary">
              Your orders
            </ButtonLink>
          )}
        </div>
        {!user && (
          <p className="text-center text-xs text-muted">Keep this page&apos;s link: it&apos;s the only way to see this order without an account.</p>
        )}
      </div>
    </div>
  );
}

function StatusBanner({ order }: { order: Order }) {
  const good = order.status === "paid";
  // A finished refund is a settled outcome, not a problem: neutral, not red.
  const problem = order.status === "cancelled" || order.status === "needs_refund";
  const tone = good ? "border-success" : problem ? "border-warning" : "border-border";
  const [title, body] = bannerText(order);
  return (
    <section aria-live="polite" className={cn("border-l-4 bg-surface p-4 sm:p-6", tone)}>
      <h1 className={cn("text-xl font-bold", good ? "text-success" : problem && "text-warning")}>{title}</h1>
      {order.status === "pending" ? (
        <div className="mt-1">
          <PendingRefresh />
        </div>
      ) : (
        <p className="mt-1 text-sm">{body}</p>
      )}
    </section>
  );
}

function bannerText(order: Order): [string, string] {
  const total = formatPrice(order.totalCents);
  switch (order.status) {
    case "pending":
      return ["Almost done", ""];
    case "paid":
      if (order.fulfilment === "delivered") return ["Delivered", "Your order has arrived."];
      if (order.fulfilment === "shipped") return ["On its way", "Your order has shipped."];
      return ["Order placed, thank you!", order.email ? `Payment received. Order confirmation for ${order.email}.` : "Payment received."];
    case "cancelled":
      return ["Order cancelled", `Your refund of ${total} hasn't gone through yet. Use "Retry refund" below, or try again in a moment.`];
    case "refunded":
      return [
        order.cancelledAt ? "Order cancelled and refunded" : "Order refunded",
        `${total} has been refunded to your card. It can take a few days to show on your statement.`,
      ];
    case "needs_refund":
      return [
        "We couldn't complete this order",
        "Your payment went through, but an item sold out before we could reserve it. Nothing was sent, and your payment is being refunded.",
      ];
  }
}
