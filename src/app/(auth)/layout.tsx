import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * Auth route group layout — plain, centered, no Navbar/Footer.
 * Dark "midnight & gold" backdrop with a subtle radial glow.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10 sm:py-14">
      {/* Subtle radial glow backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18%] h-[420px] w-[min(720px,140vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(245,185,11,0.16),transparent)] blur-2xl" />
        <div className="absolute bottom-[-28%] right-[-12%] h-[380px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(245,185,11,0.09),transparent)] blur-2xl" />
        <div className="absolute bottom-[8%] left-[-14%] h-[300px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(217,154,0,0.07),transparent)] blur-2xl" />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center gap-7">
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="RAJA GAMING — back to home"
        >
          <Logo />
        </Link>

        <main className="w-full max-w-md">
          <div className="card-raja card-glow p-6 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] sm:p-8">
            {children}
          </div>
        </main>
      </div>

      <p className="relative z-10 mt-7 text-center text-xs text-muted-foreground">
        Gaming • Tournaments • Rewards • Community
      </p>
    </div>
  );
}
