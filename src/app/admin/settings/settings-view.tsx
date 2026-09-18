"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { PageHeader } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type FieldType = "text" | "textarea" | "switch" | "number";

type FieldDef = { key: string; label: string; type: FieldType; hint?: string; placeholder?: string };

type SectionDef = { title: string; description: string; fields: FieldDef[] };

const SECTIONS: SectionDef[] = [
  {
    title: "Site",
    description: "Brand name and metadata used across the public site.",
    fields: [
      { key: "SITE_NAME", label: "Site name", type: "text", placeholder: "RAJA GAMING" },
      { key: "SITE_TAGLINE", label: "Tagline", type: "text", placeholder: "Gaming • Tournaments • Rewards • Community" },
      { key: "SITE_DESCRIPTION", label: "Description", type: "textarea", hint: "Used for SEO and social previews." },
    ],
  },
  {
    title: "Contact",
    description: "Support channels shown on the contact page and footer.",
    fields: [
      { key: "CONTACT_EMAIL", label: "Support email", type: "text" },
      { key: "CONTACT_PHONE", label: "Phone", type: "text" },
      { key: "CONTACT_WHATSAPP", label: "WhatsApp", type: "text" },
      { key: "CONTACT_ADDRESS", label: "Address", type: "text" },
    ],
  },
  {
    title: "Payments",
    description: "Easypaisa collection account and payment gate switch.",
    fields: [
      { key: "PAYMENTS_ENABLED", label: "Payments enabled", type: "switch", hint: "Turning this off hides checkout worldwide." },
      { key: "PAYMENT_METHOD_NAME", label: "Payment method name", type: "text", placeholder: "Easypaisa" },
      { key: "EASYPAISA_ACCOUNT_TITLE", label: "Easypaisa account title", type: "text" },
      { key: "EASYPAISA_ACCOUNT_NUMBER", label: "Easypaisa account number", type: "text" },
      { key: "EASYPAISA_INSTRUCTIONS", label: "Payment instructions", type: "textarea", hint: "Shown to players on the payment step." },
      { key: "MIN_PAYMENT_AMOUNT", label: "Minimum payment amount (Rs)", type: "number" },
      { key: "REGISTRATION_PAYMENT_NOTE", label: "Tournament registration payment note", type: "textarea" },
    ],
  },
  {
    title: "Features",
    description: "Turn whole platform sections on or off.",
    fields: [
      { key: "TOURNAMENTS_ENABLED", label: "Tournaments enabled", type: "switch" },
      { key: "MARKETPLACE_ENABLED", label: "Marketplace enabled", type: "switch" },
      { key: "MARKETPLACE_SELLING_ENABLED", label: "Marketplace selling enabled", type: "switch", hint: "Users can list accounts for sale." },
      { key: "REVIEWS_AUTO_APPROVE", label: "Auto-approve reviews", type: "switch", hint: "Otherwise reviews wait for moderation." },
    ],
  },
  {
    title: "Growth",
    description: "Referral programme configuration.",
    fields: [
      { key: "REFERRAL_REWARD_AMOUNT", label: "Referral reward (Rs)", type: "number", hint: "Credited to the referrer when the referred user's first payment is verified." },
    ],
  },
  {
    title: "Maintenance",
    description: "Emergency switch for taking the public site offline.",
    fields: [
      { key: "MAINTENANCE_MODE", label: "Maintenance mode", type: "switch", hint: "Visitors see the maintenance message instead of the site." },
      { key: "MAINTENANCE_MESSAGE", label: "Maintenance message", type: "textarea" },
    ],
  },
];

export function SettingsView() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ settings: Record<string, string> }>("/api/admin/settings");
      setValues(res.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setValue(key: string, value: string) {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setBool(key: string, checked: boolean) {
    setValues((prev) => (prev ? { ...prev, [key]: checked ? "true" : "false" } : prev));
  }

  async function save() {
    if (!values) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const section of SECTIONS) {
        for (const field of section.fields) {
          payload[field.key] = values[field.key] ?? "";
        }
      }
      await apiFetch("/api/admin/settings", { method: "PUT", json: payload });
      toast.success("Settings saved");
      const res = await apiFetch<{ settings: Record<string, string> }>("/api/admin/settings");
      setValues(res.settings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const maintenanceOn = values?.MAINTENANCE_MODE === "true";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Site Settings"
        description="Database-backed configuration with a 30 second cache. Changes take effect site-wide."
        actions={
          <Button onClick={() => void save()} disabled={saving || loading || !!error} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Save all
          </Button>
        }
      />

      {maintenanceOn && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Maintenance mode is ON</AlertTitle>
          <AlertDescription>
            The public site is showing the maintenance message to visitors. Turn it off below when work is done.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <Card className="card-raja">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <SettingsIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Could not load settings</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : loading || !values ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {SECTIONS.map((section) => (
            <Card key={section.title} className="card-raja">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-lg font-bold tracking-wide">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {section.fields.map((field) => {
                  const value = values[field.key] ?? "";
                  if (field.type === "switch") {
                    const checked = value === "true";
                    return (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-4 rounded-md border border-border/70 p-3"
                      >
                        <div>
                          <Label htmlFor={`set-${field.key}`}>{field.label}</Label>
                          {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                        </div>
                        <Switch
                          id={`set-${field.key}`}
                          checked={checked}
                          onCheckedChange={(checked) => setBool(field.key, checked)}
                        />
                      </div>
                    );
                  }
                  if (field.type === "textarea") {
                    return (
                      <div key={field.key} className="grid gap-2">
                        <Label htmlFor={`set-${field.key}`}>{field.label}</Label>
                        <Textarea
                          id={`set-${field.key}`}
                          value={value}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          rows={3}
                          maxLength={5000}
                          placeholder={field.placeholder}
                        />
                        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                      </div>
                    );
                  }
                  return (
                    <div key={field.key} className="grid gap-2">
                      <Label htmlFor={`set-${field.key}`}>{field.label}</Label>
                      <Input
                        id={`set-${field.key}`}
                        type={field.type === "number" ? "number" : "text"}
                        value={value}
                        onChange={(e) => setValue(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Booleans are stored as the strings &quot;true&quot; / &quot;false&quot;. Amounts are whole rupees.
      </p>
    </div>
  );
}
