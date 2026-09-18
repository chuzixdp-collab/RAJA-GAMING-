import type { Metadata } from "next";
import { Clock, Mail, MessageCircle, Phone } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageHeader } from "@/components/shared/status-badge";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { ContactForm } from "./contact-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the RAJA GAMING support team — we usually respond within 24 hours.",
};

export default async function ContactPage() {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);

  const email = settings.CONTACT_EMAIL || "";
  const phone = settings.CONTACT_PHONE || "";
  const whatsapp = settings.CONTACT_WHATSAPP || "";

  return (
    <>
      <Navbar />
      <main className="min-h-[70vh]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <PageHeader
            title="Contact Us"
            description="Questions about an order, payment, or tournament? Send us a message — we are here 24/7."
          />

          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ContactForm
                defaultName={user?.name ?? ""}
                defaultEmail={user?.email ?? ""}
              />
            </div>

            <aside className="space-y-4 lg:col-span-2" aria-label="Contact information">
              <div className="card-raja p-5">
                <h2 className="font-display text-base font-bold uppercase tracking-wider">Reach Us Directly</h2>
                <ul className="mt-4 space-y-4 text-sm">
                  {email ? (
                    <li className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Mail className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Email</p>
                        <a href={`mailto:${email}`} className="font-medium transition-colors hover:text-primary">
                          {email}
                        </a>
                      </div>
                    </li>
                  ) : null}
                  {phone ? (
                    <li className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Phone</p>
                        <span className="font-medium">{phone}</span>
                      </div>
                    </li>
                  ) : null}
                  {whatsapp ? (
                    <li className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">WhatsApp</p>
                        <span className="font-medium">{whatsapp}</span>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </div>

              <div className="rounded-lg border border-primary/25 bg-primary/5 p-5">
                <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary">
                  <Clock className="h-4 w-4" aria-hidden="true" /> Response Time
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  We usually respond within 24 hours — payment verifications and order issues are prioritized.
                  For urgent payment matters, include your order number and transaction ID.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card/50 p-5">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider">Before You Write</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Many questions are answered in our FAQ — delivery times, payment steps, tournament rules and
                  marketplace safety are all covered there.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
