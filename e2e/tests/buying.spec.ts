import { expect, test } from "@playwright/test";
import { addToBasket, basketLabel, cancelAndRefund, payWithTestCard, signUp, uniqueEmail } from "./helpers";

// One shared order link between the account test and the privacy test.
test.describe.configure({ mode: "serial" });
let accountOrderPath = "";

test("a guest searches, filters, buys and pays", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search" }).fill("kiwi");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?.*q=kiwi/);

  // The sidebar filter, not the department strip in the header.
  await page.locator('aside[aria-labelledby="filters-heading"]').getByRole("link", { name: /^Grocery/ }).click();
  await expect(page).toHaveURL(/category=grocery/);
  await page.getByRole("link", { name: "Kiwi", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kiwi" })).toBeVisible();

  await addToBasket(page);
  await expect(basketLabel(page)).toHaveAttribute("aria-label", "Basket, 1 item");

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Shopping Basket" })).toBeVisible();
  await page.getByRole("button", { name: "Proceed to checkout" }).click();
  await payWithTestCard(page, uniqueEmail("guest"));

  await expect(page.getByText("1 × $2.49")).toBeVisible();
  // The payment emptied the basket.
  await expect(basketLabel(page)).toHaveAttribute("aria-label", "Basket, 0 items");
  await cancelAndRefund(page);
});

test("an account keeps its basket, uses Buy Now and sees the order in Your Orders", async ({ page }) => {
  const email = uniqueEmail("account");

  // Something in the basket as a guest first: it must survive sign up and Buy Now.
  await page.goto("/products/honey-jar");
  await addToBasket(page);
  await signUp(page, "Ada", email);
  await expect(basketLabel(page)).toHaveAttribute("aria-label", "Basket, 1 item");

  await page.goto("/products/apple");
  await page.getByRole("button", { name: "Buy Now" }).click();
  accountOrderPath = await payWithTestCard(page, email);
  await expect(page.getByText("1 × $1.99")).toBeVisible();
  // Buy Now paid for the apple only; the honey jar is still waiting in the basket.
  await expect(basketLabel(page)).toHaveAttribute("aria-label", "Basket, 1 item");

  await page.getByRole("button", { name: /Hello, Ada/ }).click();
  await page.getByRole("link", { name: "Your Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  const order = page.locator("main ul > li").first();
  await expect(order).toContainText("Apple");
  await expect(order).toContainText("$1.99");

  await page.goto(accountOrderPath);
  await cancelAndRefund(page);
});

test("another account can't open that order, even with the link", async ({ page }) => {
  expect(accountOrderPath, "needs the order from the previous test").not.toBe("");
  await signUp(page, "Bob", uniqueEmail("other"));
  const res = await page.goto(accountOrderPath);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that order" })).toBeVisible();
});
