ALTER TYPE "public"."order_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'refunded';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;