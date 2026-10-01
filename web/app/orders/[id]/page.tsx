import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PendingRefresh } from "@/components/order/pending-refresh";
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
  const tone = order.status === "paid" ? "border-success" : order.status === "needs_refund" ? "border-warning" : "border-border";
  return (
    <section aria-live="polite" className={cn("border-l-4 bg-surface p-4 sm:p-6", tone)}>
      {order.status === "paid" && (
        <>
          <h1 className="text-xl font-bold text-success">Order placed, thank you!</h1>
          <p className="mt-1 text-sm">{order.email ? `Payment received. Order confirmation for ${order.email}.` : "Payment received."}</p>
        </>
      )}
      {order.status === "pending" && (
        <>
          <h1 className="text-xl font-bold">Almost done</h1>
          <div className="mt-1">
            <PendingRefresh />
          </div>
        </>
      )}
      {order.status === "needs_refund" && (
        <>
          <h1 className="text-xl font-bold text-warning">We couldn&apos;t complete this order</h1>
          <p className="mt-1 text-sm">
            Your payment went through, but an item sold out before we could reserve it. We haven&apos;t sent anything, and the
            order is flagged for a full refund.
          </p>
        </>
      )}
    </section>
  );
}
