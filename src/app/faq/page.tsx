import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle, MessageSquareQuote } from "lucide-react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader, EmptyState } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about diamond top-ups, payments, orders, tournaments, the marketplace and refunds on RAJA GAMING.",
};

type FaqRow = { id: string; question: string; answer: string; category: string };

const CATEGORY_ORDER = ["DIAMONDS", "TOPUP", "PAYMENT", "ORDERS", "TOURNAMENT", "MARKETPLACE", "ACCOUNT", "REFUNDS", "GENERAL"];

const CATEGORY_LABELS: Record<string, string> = {
  DIAMONDS: "Diamonds & Top-Up",
  TOPUP: "Diamonds & Top-Up",
  PAYMENT: "Payments",
  ORDERS: "Orders",
  TOURNAMENT: "Tournaments",
  MARKETPLACE: "Marketplace",
  ACCOUNT: "Account",
  REFUNDS: "Refunds",
  GENERAL: "General",
};

export default async function FaqPage() {
  const faqs: FaqRow[] = await db.faq.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, question: true, answer: true, category: true },
  });

  // group by category, ordered by our preferred sequence
  const grouped = new Map<string, FaqRow[]>();
  for (const faq of faqs) {
    const key = CATEGORY_LABELS[faq.category] ? faq.category : "GENERAL";
    const list = grouped.get(key) ?? [];
    list.push(faq);
    grouped.set(key, list);
  }
  const categories = [...grouped.keys()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <PageHeader
            title="Frequently Asked Questions"
            description="Everything you need to know about top-ups, payments, tournaments and the marketplace."
          />

          {faqs.length === 0 ? (
            <EmptyState
              icon={<MessageSquareQuote />}
              title="No FAQs published yet"
              description="Still have questions? Our support team is happy to help."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/contact">Contact Support</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-10">
              {categories.map((category) => (
                <section key={category} aria-labelledby={`faq-cat-${category}`}>
                  <h2
                    id={`faq-cat-${category}`}
                    className="font-display text-lg font-bold uppercase tracking-wider text-primary"
                  >
                    {CATEGORY_LABELS[category] ?? "General"}
                  </h2>
                  <Accordion type="single" collapsible className="card-raja mt-4 px-5">
                    {(grouped.get(category) ?? []).map((faq) => (
                      <AccordionItem key={faq.id} value={faq.id}>
                        <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                        <AccordionContent className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>
              ))}
            </div>
          )}

          <div className="mt-12 rounded-lg border border-border bg-card/50 p-6 text-center">
            <HelpCircle className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            <h2 className="mt-3 font-display text-lg font-bold tracking-wide">Still need help?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Our support team responds around the clock — usually within a few hours.
            </p>
            <Button asChild className="mt-4 font-semibold">
              <Link href="/contact">Contact Support</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
