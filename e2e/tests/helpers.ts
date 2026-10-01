import { expect, type Page } from "@playwright/test";

// A new address every run, so tests never collide with each other or with real shoppers.
export function uniqueEmail(who: string) {
  return `e2e-${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const PASSWORD = "correct horse battery staple";

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.locator("header")).toContainText(`Hello, ${name}`);
}

export function basketLabel(page: Page) {
  return page.locator('a[aria-label^="Basket"]');
}

// Works with both confirmations: the toast, and the desktop drawer once that ships.
export async function addToBasket(page: Page) {
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByText("Added to basket").first()).toBeVisible();
  await page.keyboard.press("Escape");
}

// Stripe's hosted test page. The email field only appears when Stripe doesn't already have one.
export async function payWithTestCard(page: Page, email: string) {
  await page.waitForURL(/checkout\.stripe\.com/);
  const emailField = page.locator("#email");
  if (await emailField.isEditable().catch(() => false)) await emailField.fill(email);
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("E2E Test");
  await page.locator('button[type="submit"]').first().click();
  // Back on our site; the page waits for Stripe's webhook and refreshes until the order is paid.
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Order placed, thank you!" })).toBeVisible({ timeout: 45_000 });
  return new URL(page.url()).pathname;
}

// Leaves the live store as it was: the stock goes back on sale and the test payment is refunded.
export async function cancelAndRefund(page: Page) {
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel and refund" }).click();
  await expect(page.getByRole("heading", { name: "Order cancelled and refunded" })).toBeVisible();
}
