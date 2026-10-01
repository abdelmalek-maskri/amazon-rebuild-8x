"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ToastDemo() {
  const toast = useToast();
  return (
    <Button className="self-start" onClick={() => toast({ title: "Added to basket", action: { label: "View basket", href: "/cart" } })}>
      Show toast
    </Button>
  );
}
