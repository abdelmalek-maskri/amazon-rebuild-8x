"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Rating } from "@/components/ui/rating";
import { ApiError, createReview, type ReviewEligibility } from "@/lib/api";
import { cn } from "@/lib/cn";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// Four states, decided by the API: sign in, buy first, already reviewed, or the form.
export function WriteReview({ slug, eligibility }: { slug: string; eligibility: ReviewEligibility }) {
  if (eligibility.reason === "SIGN_IN") {
    return (
      <Box>
        <p className="text-sm">Bought this? Share what you think with other shoppers.</p>
        <Link href={`/signin?next=${encodeURIComponent(`/products/${slug}#reviews`)}`} className="text-sm text-link hover:text-link-hover hover:underline">
          Sign in to write a review
        </Link>
      </Box>
    );
  }
  if (eligibility.reason === "NOT_PURCHASED") {
    return (
      <Box>
        <p className="text-sm">You can review this item after buying it. Reviews marked Verified Purchase come from customers who bought it here.</p>
      </Box>
    );
  }
  if (eligibility.reason === "ALREADY_REVIEWED" && eligibility.myReview) {
    return (
      <Box>
        <p className="text-sm font-bold">Thanks for your review</p>
        <Rating value={eligibility.myReview.rating} className="[&>span:first-child]:hidden" />
      </Box>
    );
  }
  return <ReviewForm slug={slug} />;
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border p-4">{children}</div>;
}

function ReviewForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError("");
    if (!rating) {
      setErrors({ rating: "Choose a star rating." });
      return;
    }
    setBusy(true);
    try {
      await createReview(slug, rating, body);
      // Re-render the list, the histogram and the product's stars from the server.
      startRefresh(() => router.refresh());
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.fields.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="font-bold">Write a review</h3>
      <fieldset aria-describedby={errors.rating ? "rating-error" : undefined}>
        <legend className="mb-1 text-sm">Your rating</legend>
        {/* Real radio buttons under the stars: arrow keys, screen readers and forms work as usual. */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" title={LABELS[n]}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <span className="sr-only">{`${n} star${n > 1 ? "s" : ""}, ${LABELS[n]}`}</span>
              <svg viewBox="0 0 20 20" aria-hidden className={cn("size-8 rounded peer-focus-visible:ring-2 peer-focus-visible:ring-link", n <= rating ? "fill-star" : "fill-surface")}>
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z" className="stroke-star" strokeWidth="1" />
              </svg>
            </label>
          ))}
          {rating > 0 && <span className="ml-2 text-sm text-muted">{LABELS[rating]}</span>}
        </div>
        {errors.rating && (
          <p id="rating-error" className="mt-1 text-xs text-danger">
            {errors.rating}
          </p>
        )}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="review-body" className="text-sm">
          Your review
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? "body-error" : "body-hint"}
          className="rounded-lg border border-border p-3 text-sm aria-invalid:border-danger"
          placeholder="What did you like or dislike? How did you use it?"
        />
        {errors.body ? (
          <p id="body-error" className="text-xs text-danger">
            {errors.body}
          </p>
        ) : (
          <p id="body-hint" className="text-xs text-muted">
            At least 10 characters. {body.length}/2000
          </p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" loading={busy || refreshing} className="self-start">
        Submit review
      </Button>
    </form>
  );
}
