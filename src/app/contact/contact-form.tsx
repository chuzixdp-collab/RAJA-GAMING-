"use client";

import { useState } from "react";
import { SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MESSAGE_MAX = 2000;

export function ContactForm({
  defaultName,
  defaultEmail,
}: {
  defaultName: string;
  defaultEmail: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/contact", {
        method: "POST",
        json: { name, email, subject, message },
      });
      toast.success("Message sent — our team will get back to you soon.");
      setSubject("");
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send your message. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card-raja p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <h2 className="font-display text-lg font-bold tracking-wide">Send a Message</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="contact-name">Your Name *</Label>
          <Input
            id="contact-name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            autoComplete="name"
            placeholder="e.g. Ahmed Khan"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-email">Email Address *</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="contact-subject">Subject *</Label>
          <Input
            id="contact-subject"
            name="subject"
            required
            minLength={3}
            maxLength={120}
            placeholder="e.g. Payment verification for order RG-..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="contact-message">Message *</Label>
            <span
              className={`text-xs ${message.length > MESSAGE_MAX * 0.9 ? "text-destructive" : "text-muted-foreground"}`}
              aria-live="polite"
            >
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <Textarea
            id="contact-message"
            name="message"
            required
            minLength={10}
            maxLength={MESSAGE_MAX}
            rows={7}
            placeholder="Describe your issue or question — include order numbers and transaction IDs where relevant."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" className="mt-5 font-semibold" disabled={busy}>
        <SendHorizonal className="h-4 w-4" aria-hidden="true" />
        {busy ? "Sending…" : "Send Message"}
      </Button>
    </form>
  );
}
