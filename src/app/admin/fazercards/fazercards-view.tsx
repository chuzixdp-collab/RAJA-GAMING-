"use client";

/**
 * Supplier (FazerCards) admin control panel — PRIMARY supplier.
 *
 * Security notes:
 *  - The status endpoint reports credential PRESENCE only (booleans) — the
 *    API key and webhook secret are never displayed anywhere in this UI.
 *  - Live categories/offers come from the server-side client; this page only
 *    ever talks to our own API routes.
 *  - The catalog sync is additive: it never deletes manual or ALUU packages.
 *  - Orders can only be submitted for orders with a VERIFIED payment; all
 *    supplier actions are idempotent.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudDownload,
  CreditCard,
  Loader2,
  RefreshCw,
  Send,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FazerStatus = {
  config: { apiKeySet: boolean; webhookSecretSet: boolean; baseUrl: string };
  enabled: boolean;
  account: {
    reachable: boolean;
    balanceUsd: string | null;
    login: string | null;
    plan: string | null;
    subscriptionActive: boolean | null;
    error: string | null;
  };
  orders: { total: number; successful: number; pending: number; failed: number; byStatus: Record<string, number> };
  settings: { usdToPkr: string; markupPercent: string; ffCategoryId: string };
};

type CategoryRow = { category_id: string; name: string };
type OfferRow = { offer_id: string; name: string; price_usd: string };

type SupplierOrderRow = {
  id: string;
  partnerOrderNumber: string;
  fzrOrderId: string | null;
  gameCode: string;
  denom: string;
  userid: string;
  amountUsdCents: number | null;
  status: string;
  statusMessage: string | null;
  submittedAt: string;
  lastStatusAt: string | null;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "SUCCESSFUL":
      return "default";
    case "PENDING":
    case "SUBMIT_FAILED":
      return "secondary";
    case "ERROR":
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export function FazerCardsView() {
  const [status, setStatus] = useState<FazerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

  const [orders, setOrders] = useState<SupplierOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [applySuggestedPrices, setApplySuggestedPrices] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch<FazerStatus>("/api/admin/fazercards/status");
      setStatus(res);
      if (res?.settings?.ffCategoryId) setSelectedCategory((prev) => prev || res.settings.ffCategoryId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load FazerCards status.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await apiFetch<{ orders: SupplierOrderRow[] }>("/api/admin/fazercards/orders");
      setOrders(res.orders ?? []);
    } catch {
      // The orders endpoint may not have rows yet; keep the table empty.
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadOrders();
  }, [loadStatus, loadOrders]);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await apiFetch<{ categories: CategoryRow[] }>("/api/admin/fazercards/categories");
      setCategories(res.categories ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load categories.");
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadOffers = useCallback(async (categoryId: string) => {
    if (!categoryId) return;
    setOffersLoading(true);
    setOffers([]);
    try {
      const res = await apiFetch<{ offers: OfferRow[] }>(
        `/api/admin/fazercards/offers?category_id=${encodeURIComponent(categoryId)}`
      );
      setOffers(res.offers ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load offers.");
    } finally {
      setOffersLoading(false);
    }
  }, []);

  const syncCatalog = useCallback(async () => {
    if (!selectedCategory) {
      toast.error("Pick a category first.");
      return;
    }
    setSyncing(true);
    try {
      const res = await apiFetch<{
        created: number; updated: number; reactivated: number; deactivated: number; skippedNoPrice: number;
      }>("/api/admin/fazercards/sync", {
        json: { categoryId: selectedCategory, applySuggestedPrices },
      });
      const r = res;
      toast.success(
        `Sync done — ${r.created} created, ${r.updated} updated, ${r.reactivated} reactivated, ${r.deactivated} deactivated${r.skippedNoPrice ? `, ${r.skippedNoPrice} skipped (no price)` : ""}.`
      );
      void loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [selectedCategory, applySuggestedPrices, loadStatus]);

  const setupWebhook = useCallback(async () => {
    setWebhookTesting(true);
    try {
      const res = await apiFetch<{ url: string; webhookSecretConfigured: boolean; test: { sent: boolean; result?: string }; note: string }>(
        "/api/admin/fazercards/webhook-setup",
        { json: { sendTest: true } }
      );
      toast.success(
        res.webhookSecretConfigured
          ? `Webhook configured for ${res.url}. Secret already set — receiver is live.`
          : `Webhook configured for ${res.url}. Now copy the webhook secret from the FazerCards dashboard into FAZERCARDS_WEBHOOK_SECRET — until then the receiver stays fail-closed.`
      );
      void loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Webhook setup failed.");
    } finally {
      setWebhookTesting(false);
    }
  }, [loadStatus]);

  const refreshAll = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await apiFetch<{ polled: number; results: Array<{ orderNumber: string; outcome: string }> }>(
        "/api/admin/fazercards/refresh",
        { json: {} }
      );
      const applied = res.results.filter((r) => r.outcome.startsWith("APPLIED")).length;
      toast.success(`Polled ${res.polled} in-flight order(s) — ${applied} status change(s) applied.`);
      void loadOrders();
      void loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setOrdersLoading(false);
    }
  }, [loadOrders, loadStatus]);

  const trackOrder = useCallback(
    async (orderId: string) => {
      setBusyOrderId(orderId);
      try {
        const res = await apiFetch<{ supplierStatus: string | null; orderCompleted: boolean }>(
          "/api/admin/fazercards/track",
          { json: { orderId } }
        );
        toast.success(
          res.orderCompleted
            ? "FazerCards confirmed delivery — order marked COMPLETED."
            : `Supplier status: ${res.supplierStatus ?? "unknown"}`
        );
        void loadOrders();
        void loadStatus();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not track order.");
      } finally {
        setBusyOrderId(null);
      }
    },
    [loadOrders, loadStatus]
  );

  const retryOrder = useCallback(
    async (orderId: string) => {
      setBusyOrderId(orderId);
      try {
        const res = await apiFetch<{ fzrOrderId: string | null; status: string }>(
          "/api/admin/fazercards/submit",
          { json: { orderId } }
        );
        toast.success(`Submitted to FazerCards — status ${res.status}.`);
        void loadOrders();
        void loadStatus();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Submission failed (idempotent — safe to retry).");
      } finally {
        setBusyOrderId(null);
      }
    },
    [loadOrders, loadStatus]
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <PageHeader
        title="Supplier (FazerCards)"
        description="Primary supplier — automatic Free Fire delivery via api.fzr.cards. ALUU remains available as a backup supplier per package."
      />

      {/* Connection & balance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Connection
          </CardTitle>
          <CardDescription>Server-side configuration status — keys are never displayed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {statusLoading || !status ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  {status.config.apiKeySet ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  FAZERCARDS_API_KEY {status.config.apiKeySet ? "configured" : "MISSING"}
                </li>
                <li className="flex items-center gap-2">
                  {status.config.webhookSecretSet ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-500" />
                  )}
                  Webhook secret {status.config.webhookSecretSet ? "configured" : "not set (receiver fail-closed; polling still works)"}
                </li>
                <li className="flex items-center gap-2">
                  {status.enabled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  Auto-delivery {status.enabled ? "enabled" : "disabled (FAZERCARDS_ENABLED)"}
                </li>
                <li className="flex items-center gap-2">
                  {status.account.reachable ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  API reachable{status.account.login ? ` — ${status.account.login}` : ""}
                </li>
              </ul>
              <div className="space-y-2 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Supplier wallet balance</div>
                  <div className="text-2xl font-bold">{status.account.balanceUsd ? `$${status.account.balanceUsd}` : "—"}</div>
                  {status.account.error ? <div className="mt-1 text-xs text-red-500">{status.account.error}</div> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Total / successful</div>
                    <div className="text-lg font-semibold">
                      {status.orders.total} / {status.orders.successful}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Pending / failed</div>
                    <div className="text-lg font-semibold">
                      {status.orders.pending} / {status.orders.failed}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Catalog sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5" /> Catalog sync
          </CardTitle>
          <CardDescription>
            Additive: creates/updates packages for the chosen category. Manual and ALUU packages are never touched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadCategories} disabled={categoriesLoading}>
              {categoriesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Load categories
            </Button>
            {categories.length > 0 ? (
              <select
                aria-label="FazerCards category"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setOffers([]);
                }}
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name} ({c.category_id})
                  </option>
                ))}
              </select>
            ) : null}
            <Button onClick={() => void loadOffers(selectedCategory)} disabled={!selectedCategory || offersLoading}>
              {offersLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Preview offers
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={syncCatalog} disabled={!selectedCategory || syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
              Sync {selectedCategory || "category"} into packages
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={applySuggestedPrices} onCheckedChange={setApplySuggestedPrices} />
              Also apply suggested prices to already-synced packages
            </label>
          </div>

          {offers.length > 0 ? (
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Offer</TableHead>
                    <TableHead>offer_id</TableHead>
                    <TableHead className="text-right">Supplier price (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.map((o) => (
                    <TableRow key={o.offer_id}>
                      <TableCell>{o.name}</TableCell>
                      <TableCell className="font-mono text-xs">{o.offer_id}</TableCell>
                      <TableCell className="text-right">${o.price_usd}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" /> Automatic status sync
          </CardTitle>
          <CardDescription>
            Webhook + scheduled polling keep order statuses current. Order state is ALWAYS re-verified via the documented
            orders API — webhook payloads never change state directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertTitle>Webhook secret handling</AlertTitle>
            <AlertDescription>
              Configuring the webhook here does NOT store the secret. After setup, copy the HMAC secret from the
              FazerCards dashboard into the <code>FAZERCARDS_WEBHOOK_SECRET</code> environment variable. Until then the
              receiver fails closed (all deliveries rejected) and statuses sync via the scheduled refresh every 10
              minutes or the button below.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={setupWebhook} disabled={webhookTesting || !status?.config.apiKeySet}>
            {webhookTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Webhook className="mr-2 h-4 w-4" />}
            Configure webhook + send test event
          </Button>
        </CardContent>
      </Card>

      {/* Supplier orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>FazerCards orders</CardTitle>
            <CardDescription>Supplier order ids, statuses and errors — click Track to re-poll the supplier.</CardDescription>
          </div>
          <Button variant="outline" onClick={refreshAll} disabled={ordersLoading}>
            {ordersLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh all
          </Button>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : orders.length === 0 ? (
            <EmptyState title="No FazerCards supplier orders yet" description="Orders appear here after the first submission." />
          ) : (
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raja order</TableHead>
                    <TableHead>FazerCards id</TableHead>
                    <TableHead>UID</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.partnerOrderNumber}</TableCell>
                      <TableCell className="font-mono text-xs">{o.fzrOrderId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{o.userid}</TableCell>
                      <TableCell>{o.amountUsdCents !== null ? `$${(o.amountUsdCents / 100).toFixed(4)}` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                        {o.statusMessage ? (
                          <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={o.statusMessage}>
                            {o.statusMessage}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {o.status === "SUBMIT_FAILED" ? (
                            <Button size="sm" variant="outline" onClick={() => retryOrder(o.id)} disabled={busyOrderId === o.id}>
                              {busyOrderId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              Retry
                            </Button>
                          ) : null}
                          {o.fzrOrderId && o.status === "PENDING" ? (
                            <Button size="sm" variant="outline" onClick={() => trackOrder(o.id)} disabled={busyOrderId === o.id}>
                              {busyOrderId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              Track
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
