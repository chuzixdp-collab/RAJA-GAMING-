"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { PageHeader } from "@/components/shared/status-badge";
import { LogoMark, RajaMonogram } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DEFAULT_THEME, THEMES, type ThemeId } from "@/lib/theme";

/**
 * Website Appearance — admin-controlled global theme picker.
 *
 * Each card renders a LIVE mini preview of the real site chrome: the
 * preview wrapper carries the theme's `data-theme` attribute, so the
 * exact same CSS variables that drive the production site style the
 * preview (no fake mockups). Activation persists SITE_THEME via the
 * existing admin settings API (requireAdmin + audit-logged).
 */

function ThemePreview({ themeId }: { themeId: ThemeId }) {
  return (
    <div
      data-theme={themeId}
      className="pointer-events-none overflow-hidden rounded-lg border border-border bg-background text-foreground"
      aria-hidden="true"
    >
      {/* mini navbar */}
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <LogoMark size={16} />
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-6 rounded-full bg-muted-foreground/40" />
          <span className="h-1.5 w-6 rounded-full bg-muted-foreground/40" />
          <span className="h-4 w-10 rounded-md bg-primary" />
        </div>
      </div>
      {/* mini hero */}
      <div className="space-y-2 px-3 py-3">
        <div className="h-2.5 w-3/4 rounded-full bg-gradient-to-r from-primary/80 to-primary/30" />
        <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground/30" />
        <div className="flex gap-1.5 pt-1">
          <span className="h-5 w-14 rounded-md bg-primary" />
          <span className="h-5 w-14 rounded-md border border-border bg-transparent" />
        </div>
      </div>
      {/* mini cards */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1 rounded-md border border-border/70 bg-card p-1.5">
            <div className="h-4 rounded-sm bg-primary/25" />
            <div className="h-1 w-4/5 rounded-full bg-muted-foreground/30" />
            <div className="h-1 w-3/5 rounded-full bg-muted-foreground/20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppearanceView() {
  const [active, setActive] = useState<ThemeId | null>(null);
  const [selected, setSelected] = useState<ThemeId | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ settings: Record<string, string> }>("/api/admin/settings");
      const current = (res.settings.SITE_THEME || DEFAULT_THEME) as ThemeId;
      setActive(current);
      setSelected(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the current theme.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => selected !== null && selected !== active, [selected, active]);

  async function activate() {
    if (!selected || selected === active) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", { method: "PUT", json: { SITE_THEME: selected } });
      setActive(selected);
      toast.success(`"${THEMES.find((t) => t.id === selected)?.label}" activated — live for all visitors.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the theme.");
    } finally {
      setSaving(false);
    }
  }

  const activeLabel = THEMES.find((t) => t.id === active)?.label;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website Appearance"
        description="Pick the site-wide theme. The change applies to the whole site — public pages, dashboards and admin panel — for every visitor, and survives refreshes."
        actions={
          <Button onClick={() => void activate()} disabled={!dirty || saving || loading || !!error} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : dirty ? (
              <Save className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {dirty ? "Activate selected theme" : "Theme is live"}
          </Button>
        }
      />

      {error ? (
        <Card className="card-raja">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Palette className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Could not load the current theme</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : loading || active === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Currently active: <span className="font-semibold text-foreground">{activeLabel}</span>
            {dirty && selected && (
              <>
                {" "}— pending activation:{" "}
                <span className="font-semibold text-primary">{THEMES.find((t) => t.id === selected)?.label}</span>
              </>
            )}
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {THEMES.map((theme) => {
              const isActive = theme.id === active;
              const isSelected = theme.id === selected;
              return (
                <Card
                  key={theme.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => setSelected(theme.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(theme.id);
                    }
                  }}
                  className={cn(
                    "card-raja card-glow cursor-pointer outline-none transition-shadow hover:shadow-lg",
                    "focus-visible:ring-2 focus-visible:ring-ring/60",
                    isSelected && "border-primary/60 shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.35)]"
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="font-display text-base font-bold tracking-wide">
                        {theme.label}
                      </CardTitle>
                      {isActive && (
                        <span className="badge-outline-gold inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          <Check className="h-3 w-3" aria-hidden="true" /> Active
                        </span>
                      )}
                    </div>
                    <CardDescription>{theme.description}</CardDescription>
                    <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
                      {[theme.swatch.accent, theme.swatch.secondary, theme.swatch.background].map((c) => (
                        <span
                          key={c}
                          className="h-3.5 w-3.5 rounded-full border border-white/15"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ThemePreview themeId={theme.id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="card-raja">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base font-bold">
                <RajaMonogram size={20} /> How themes work
              </CardTitle>
              <CardDescription>
                The active theme is stored in the site settings database and applied server-side on every
                page request — visitors never choose a theme, and the selection persists across refreshes,
                devices and deployments. Only admins can change it, and every activation is recorded in the
                audit log. Themes are purely visual: payments, orders, wallets and all other functionality
                are untouched.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}
