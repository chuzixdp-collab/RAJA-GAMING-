import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getSettings } from "@/lib/settings";

const QUICK_LINKS = [
  { href: "/top-up", label: "Diamond Top-Up" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/marketplace", label: "ID Marketplace" },
  { href: "/faq", label: "FAQ" },
];

const ACCOUNT_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/orders", label: "My Orders" },
  { href: "/dashboard/wallet", label: "Wallet" },
  { href: "/contact", label: "Support" },
];

export async function Footer() {
  const settings = await getSettings();
  const email = settings.CONTACT_EMAIL || "support@rajagaming.app";
  const whatsapp = settings.CONTACT_WHATSAPP || "";

  return (
    <footer className="mt-auto border-t border-border/70 bg-[#070709]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              {settings.SITE_TAGLINE || "Gaming • Tournaments • Rewards • Community"}
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              Manual payments via {settings.PAYMENT_METHOD_NAME || "EasyPaisa"}
            </p>
          </div>

          <nav aria-label="Quick links">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2.5">
              {QUICK_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Account">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
              Account
            </h3>
            <ul className="mt-4 space-y-2.5">
              {ACCOUNT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
              Contact
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href={`mailto:${email}`} className="transition-colors hover:text-primary">
                  {email}
                </a>
              </li>
              {whatsapp && <li>WhatsApp: {whatsapp}</li>}
              {settings.CONTACT_PHONE && <li>Phone: {settings.CONTACT_PHONE}</li>}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} {settings.SITE_NAME || "RAJA GAMING"}. All rights reserved.</p>
          <p>All transactions are manually verified by our team for your safety.</p>
        </div>
      </div>
    </footer>
  );
}
