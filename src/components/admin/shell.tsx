"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Contact, FileQuestion, Gavel, LayoutDashboard, Menu, MessageSquareQuote,
  Package, Receipt, Settings, ShieldCheck, ShoppingBag, Star, TicketPercent,
  Trophy, Users, Wallet, ScrollText,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState, type ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/packages", label: "Diamond Packages", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
  { href: "/admin/payments", label: "Payments", icon: ShoppingBag },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/marketplace", label: "Marketplace", icon: Gavel },
  { href: "/admin/transactions", label: "ID Transactions", icon: ShieldCheck },
  { href: "/admin/wallet", label: "Wallet", icon: Wallet },
  { href: "/admin/coupons", label: "Coupons", icon: TicketPercent },
  { href: "/admin/referrals", label: "Referrals", icon: Users },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/contact", label: "Contact", icon: Contact },
  { href: "/admin/faqs", label: "FAQs", icon: FileQuestion },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "bg-primary/10 text-primary"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-64 shrink-0 xl:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-lg border border-border bg-sidebar p-3">
            <Link href="/" className="mb-4 block px-2 pt-1">
              <Logo />
            </Link>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Admin Panel
            </p>
            <NavLinks />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-10">
          <div className="mb-4 flex items-center justify-between xl:hidden">
            <Link href="/admin" className="flex items-center gap-2 font-display font-bold">
              <ShieldCheck className="h-5 w-5 text-primary" /> Admin Panel
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open admin menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetTitle className="sr-only">Admin menu</SheetTitle>
                <div className="mt-2">
                  <Link href="/" className="mb-4 block">
                    <Logo />
                  </Link>
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
