import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader } from "@/components/shared/status-badge";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { OrderPanel } from "./order-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diamond Top-Up",
  description: "Instant Free Fire diamond top-up with secure EasyPaisa payments and manual verification.",
};

export default async function TopUpPage() {
  const [packages, settings, user] = await Promise.all([
    db.diamondPackage.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    getSettings(),
    getCurrentUser(),
  ]);

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <PageHeader
            title="Diamond Top-Up"
            description="Pick a package, pay via CryptoEze QR or EasyPaisa — diamonds are delivered to your Free Fire UID automatically once the payment is verified."
          />
          <OrderPanel
            packages={packages.map((p) => ({
              id: p.id,
              title: p.title,
              diamonds: p.diamonds,
              price: p.price,
              badge: p.badge,
              description: p.description,
              supplierManaged: p.supplierSource === "ALUU",
            }))}
            settings={{
              paymentMethod: settings.PAYMENT_METHOD_NAME || "EasyPaisa",
              accountTitle: settings.EASYPAISA_ACCOUNT_TITLE || "",
              accountNumber: settings.EASYPAISA_ACCOUNT_NUMBER || "",
              instructions: settings.EASYPAISA_INSTRUCTIONS || "",
              paymentsEnabled: settings.PAYMENTS_ENABLED === "true" || settings.PAYMENTS_ENABLED === "1",
            }}
            isLoggedIn={!!user}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
