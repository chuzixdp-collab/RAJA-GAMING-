"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Coins, Gamepad2, LayoutDashboard, Menu, Receipt, Settings, Star, Store, TicketPercent, Trophy, Users, Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState, type ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Orders", icon: Receipt },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/dashboard/marketplace", label: "Marketplace", icon: Store },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/referrals", label: "Referrals", icon: Users },
  { href: "/dashboard/coupons", label: "Coupons", icon: TicketPercent },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard navigation" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
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

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 card-raja p-3">
            <Link href="/" className="mb-4 block px-2 pt-1">
              <Logo />
            </Link>
            <NavLinks />
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 pb-10">
          {/* Mobile top bar */}
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <Link href="/dashboard" className="flex items-center gap-2 font-display font-bold">
              <Gamepad2 className="h-5 w-5 text-primary" /> Player Panel
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open dashboard menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetTitle className="sr-only">Dashboard menu</SheetTitle>
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
