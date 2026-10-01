import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header/header";
import { CartDrawerProvider } from "@/components/cart/cart-drawer";
import { ToastProvider } from "@/components/ui/toast";
import { SITE_NAME } from "@/lib/site";
import "./globals.css";

// Amazon Ember is proprietary; Inter is the closest open font in feel and legibility.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: `${SITE_NAME}: a calmer way to shop`, template: `%s | ${SITE_NAME}` },
  description: "Search, compare and buy without ads, pop ups or a forced sign in.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body id="top" className="flex min-h-dvh flex-col">
        <ToastProvider>
          <CartDrawerProvider>
            <Header />
            <main id="main" className="flex flex-1 flex-col">
              {children}
            </main>
            <Footer />
          </CartDrawerProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
