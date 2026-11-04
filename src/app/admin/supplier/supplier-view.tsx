"use client";

/**
 * Supplier (ALUU) admin control panel.
 *
 * Security notes:
 *  - The status endpoint reports credential PRESENCE only (booleans) — keys
 *    are never displayed anywhere in this UI.
 *  - Live products/games come from the signed server-side client; this page
 *    only ever talks to our own API routes.
 *  - The catalog sync is additive: it never deletes manual packages.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudDownload,
  Eye,
  Gamepad2,
  Loader2,
  RefreshCw,
  Save,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type AluuStatus = {
  configured: boolean;
  apiKeySet: boolean;
  secretSet: boolean;
  webhookUrlSet: boolean;
  baseUrl: string;
  balance: number | null;
  currency: string | null;
  plan: { name: string | null } | null;
  note?: string;
  warning?: string | null;
};

type GameRow = { name: string; gamecode: string; totalProducts: number | null };

type ProductRow = {
  name: string;
  pack: string;
  diamonds: number | null;
  priceUsdCents: number | null;
  stockStatus: string | null;
};

type SyncResult = {
  gameCode: string;
  packs: number;
  created: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  skippedNoPrice: number;
};

export function SupplierView() {
  const [status, setStatus] = useState<AluuStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [gameCodeDraft, setGameCodeDraft] = useState("");
  const [savingGameCode, setSavingGameCode] = useState(false);

  const [games, setGames] = useState<GameRow[] | null>(null);
  const [gamesLoading, setGamesLoading] = useState(false);

  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);

  const [applySuggestedPrices, setApplySuggestedPrices] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [statusRes, settingsRes] = await Promise.all([
        apiFetch<AluuStatus>("/api/admin/aluu/status"),
        apiFetch<{ settings: Record<string, string> }>("/api/admin/settings"),
      ]);
      setStatus(statusRes);
      setSettings(settingsRes.settings);
      setGameCodeDraft(settingsRes.settings.ALUU_FF_GAMECODE ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load supplier status.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function loadGames() {
    setGamesLoading(true);
    try {
      const res = await apiFetch<{ games: GameRow[] }>("/api/admin/aluu/games");
      setGames(res.games);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load games.");
    } finally {
      setGamesLoading(false);
    }
  }

  async function saveGameCode() {
    const code = gameCodeDraft.trim();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(code)) {
      toast.error("Enter a valid game code (letters, numbers, dashes).");
      return;
    }
    setSavingGameCode(true);
    try {
      const res = await apiFetch<{ settings: Record<string, string> }>("/api/admin/settings", {
        method: "PUT",
        json: { ALUU_FF_GAMECODE: code },
      });
      setSettings(res.settings);
      toast.success(`Free Fire game code saved: ${code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the game code.");
    } finally {
      setSavingGameCode(false);
    }
  }

  async function previewProducts() {
    const code = (settings.ALUU_FF_GAMECODE ?? gameCodeDraft).trim();
    if (!code) {
      toast.error("Save a game code first.");
      return;
    }
    setProductsLoading(true);
    setProducts(null);
    try {
      const res = await apiFetch<{ gameCode: string; products: ProductRow[] }>(
        `/api/admin/aluu/products?gamecode=${encodeURIComponent(code)}`
      );
      setProducts(res.products);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load products.");
    } finally {
      setProductsLoading(false);
    }
  }

  async function syncCatalog() {
    const code = (settings.ALUU_FF_GAMECODE ?? gameCodeDraft).trim();
    if (!code) {
      toast.error("Save a game code first.");
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch<SyncResult>("/api/admin/aluu/sync", {
        method: "POST",
        json: { gamecode: code, applySuggestedPrices },
      });
      setSyncResult(res);
      toast.success(`Sync complete — ${res.created} created, ${res.updated} updated.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier — ALUU"
        description="Free Fire Global auto-delivery. Live catalog, wallet and connection status."
        actions={
          statusLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading status" />
          ) : (
            <Button variant="outline" size="sm" onClick={() => void loadStatus()} disabled={statusLoading}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
            </Button>
          )
        }
      />

      {/* Connection status */}
      <Card className="card-raja">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Wallet className="h-4 w-4" aria-hidden="true" /> Connection
          </CardTitle>
          <CardDescription>Credential presence only — keys are never shown.</CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading && !status ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : status ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <PresenceRow label="API key (ALU_API_KEY)" present={status.apiKeySet} />
              <PresenceRow label="Secret key (ALU_SECRET_KEY)" present={status.secretSet} />
              <PresenceRow
                label="Webhook URL reachable (HTTPS)"
                present={status.webhookUrlSet}
                hint={
                  status.webhookUrlSet
                    ? "Set NEXT_PUBLIC_APP_URL or ALUU_WEBHOOK_URL."
                    : "Not resolved — supplier orders can still be placed and tracked manually."
                }
              />
              <div className="rounded-md border border-border/70 p-3 text-sm">
                <p className="text-muted-foreground">Wallet balance</p>
                <p className="mt-1 font-semibold">
                  {status.configured
                    ? status.balance !== null
                      ? `$${status.balance.toFixed(3)} ${status.currency ?? "USD"}`
                      : "Unavailable"
                    : "—"}
                </p>
                {status.plan?.name && <p className="mt-1 text-xs text-muted-foreground">Plan: {status.plan.name}</p>}
              </div>
              {status.note && (
                <Alert className="sm:col-span-2">
                  <AlertTitle>Not fully configured</AlertTitle>
                  <AlertDescription>
                    {status.note} Set the environment variables on the server (Netlify → Site settings → Environment
                    variables), then redeploy.
                  </AlertDescription>
                </Alert>
              )}
              {status.warning && (
                <Alert variant="destructive" className="sm:col-span-2">
                  <AlertTitle>ALUU warning</AlertTitle>
                  <AlertDescription>{status.warning}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Game code + games list */}
      <Card className="card-raja">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Gamepad2 className="h-4 w-4" aria-hidden="true" /> Free Fire game code
          </CardTitle>
          <CardDescription>
            Resolve the Free Fire Global code from the live games list, save it, then preview and sync its packs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="aluu-gamecode">Game code (ALUU_FF_GAMECODE)</Label>
              <Input
                id="aluu-gamecode"
                value={gameCodeDraft}
                onChange={(e) => setGameCodeDraft(e.target.value)}
                placeholder="e.g. freefire"
                maxLength={40}
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void saveGameCode()} disabled={savingGameCode || !gameCodeDraft.trim()}>
                {savingGameCode ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Save
              </Button>
              <Button variant="outline" onClick={() => void loadGames()} disabled={gamesLoading || !status?.configured}>
                {gamesLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CloudDownload className="h-4 w-4" aria-hidden="true" />}
                Load games from ALUU
              </Button>
            </div>
          </div>

          {games && games.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Packs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {games.map((g) => (
                    <TableRow key={g.gamecode}>
                      <TableCell>{g.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <button
                          type="button"
                          className="underline decoration-dotted"
                          onClick={() => setGameCodeDraft(g.gamecode)}
                          title="Use this code"
                        >
                          {g.gamecode}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{g.totalProducts ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catalog preview + sync */}
      <Card className="card-raja">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Eye className="h-4 w-4" aria-hidden="true" /> Live packs &amp; catalog sync
          </CardTitle>
          <CardDescription>
            Exact supplier denominations and USD prices. Syncing is additive — manually created packages are never
            touched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="aluu-apply-prices"
                checked={applySuggestedPrices}
                onCheckedChange={setApplySuggestedPrices}
              />
              <Label htmlFor="aluu-apply-prices" className="text-sm">
                Also re-apply suggested prices to existing synced packs
              </Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void previewProducts()} disabled={productsLoading || !status?.configured}>
                {productsLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                Preview packs
              </Button>
              <Button onClick={() => void syncCatalog()} disabled={syncing || !status?.configured}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CloudDownload className="h-4 w-4" aria-hidden="true" />}
                Sync catalog
              </Button>
            </div>
          </div>

          {syncResult && (
            <Alert>
              <AlertTitle>Sync result — {syncResult.gameCode}</AlertTitle>
              <AlertDescription>
                {syncResult.packs} supplier packs · {syncResult.created} created · {syncResult.updated} updated ·{" "}
                {syncResult.deactivated} deactivated (out of stock) · {syncResult.reactivated} reactivated ·{" "}
                {syncResult.skippedNoPrice} skipped (no supplier price)
              </AlertDescription>
            </Alert>
          )}

          {productsLoading && !products ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <div className="max-h-96 overflow-y-auto rounded-md border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pack</TableHead>
                    <TableHead>Denom (Pack)</TableHead>
                    <TableHead>Diamonds</TableHead>
                    <TableHead className="text-right">Supplier price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.pack}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.pack}</TableCell>
                      <TableCell>{p.diamonds !== null ? p.diamonds.toLocaleString("en-PK") : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {p.priceUsdCents !== null ? `$${(p.priceUsdCents / 100).toFixed(3)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.stockStatus === "out_of_stock" ? "destructive" : "secondary"}>
                          {p.stockStatus ?? "unknown"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : products ? (
            <EmptyState
              icon={<Gamepad2 />}
              title="No packs returned"
              description="The supplier returned no products for this game code."
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function PresenceRow({ label, present, hint }: { label: string; present: boolean; hint?: string }) {
  return (
    <div className="rounded-md border border-border/70 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        {present ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Set" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-label="Missing" />
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
