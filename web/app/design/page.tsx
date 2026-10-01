import type { Metadata } from "next";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { ToastDemo } from "./toast-demo";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

// Every base component in every state, for review at 375px and 1280px. Not linked from the store.
export default function DesignPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">Design system</h1>

      <Section title="Colours">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {["nav", "nav-light", "page", "cta", "buy", "link", "link-hover", "star", "success", "warning", "danger", "border"].map((c) => (
            <div key={c} className="text-xs">
              <div className="h-10 rounded border border-border" style={{ background: `var(--color-${c})` }} />
              {c}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Add to basket</Button>
          <Button variant="buy">Buy now</Button>
          <Button variant="secondary">Cancel</Button>
          <Button loading>Adding</Button>
          <Button disabled>Out of stock</Button>
          <ButtonLink href="/" variant="secondary">
            Link as button
          </ButtonLink>
        </div>
        <div className="max-w-xs">
          <Button fullWidth>Proceed to checkout</Button>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-md gap-4">
          <Input label="Email" name="email" type="email" placeholder="you@example.com" hint="We'll send your receipt here." />
          <Input label="Password" name="password" type="password" error="Passwords must be at least 8 characters." />
          <Select label="Sort by" name="sort" defaultValue="featured">
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </Select>
          <fieldset>
            <legend className="text-sm font-bold">Brand</legend>
            <Checkbox label="Apple" count={12} defaultChecked />
            <Checkbox label="Samsung" count={8} />
            <Checkbox label="Sony" count={0} disabled />
          </fieldset>
        </div>
      </Section>

      <Section title="Price and rating">
        <div className="flex flex-wrap items-end gap-6">
          <Price cents={2999} />
          <Price cents={123456} size="lg" />
          <Price cents={79} />
        </div>
        <div className="flex flex-col gap-2">
          <Rating value={4.3} count={3} />
          <Rating value={5} count={1} />
          <Rating value={2.7} count={1840} />
          <Rating value={0} />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Free returns</Badge>
          <Badge tone="success">In stock</Badge>
          <Badge tone="warning">Only 3 left</Badge>
          <Badge tone="danger">Out of stock</Badge>
        </div>
      </Section>

      <Section title="Product card (sketch)">
        <div className="grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
          <article className="flex flex-col gap-2">
            <div className="relative aspect-square overflow-hidden rounded bg-page">
              <Image
                src="https://cdn.dummyjson.com/product-images/smartphones/iphone-13-pro/thumbnail.webp"
                alt="iPhone 13 Pro"
                fill
                sizes="(min-width: 640px) 33vw, 50vw"
                className="object-contain p-4 mix-blend-multiply"
              />
            </div>
            <h3 className="line-clamp-2 text-sm text-link hover:text-link-hover">iPhone 13 Pro</h3>
            <Rating value={4.3} count={3} />
            <Price cents={109999} />
            <Badge tone="warning" className="self-start">
              Only 3 left
            </Badge>
          </article>
          <article className="flex flex-col gap-2" aria-hidden>
            <Skeleton className="aspect-square" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
          </article>
        </div>
      </Section>

      <Section title="Empty and error states">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState
            title="No results for “blue toaster”"
            message="Try fewer filters or a different word."
            action={<Button variant="secondary">Clear all filters</Button>}
          />
          <ErrorState
            title="We couldn't load your basket"
            message="This is on our side. Please try again in a moment."
            action={<Button variant="secondary">Try again</Button>}
          />
        </div>
      </Section>

      <Section title="Toast">
        <ToastDemo />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
