"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
};

const ENTITY_FILTERS = [
  "User",
  "TopUpOrder",
  "DiamondPackage",
  "Wallet",
  "Withdrawal",
  "Coupon",
  "Notification",
  "SiteSetting",
  "Tournament",
  "TournamentRegistration",
  "Listing",
  "Purchase",
  "Review",
  "ContactMessage",
  "Faq",
  "Referral",
];

function prettyMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return "—";
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

const PAGE_SIZES = ["50", "100", "200"] as const;

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entity, setEntity] = useState("ALL");
  const [take, setTake] = useState<string>("100");
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      const isMore = !!cursor;
      if (isMore) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (entity !== "ALL") params.set("entity", entity);
        params.set("take", take);
        if (cursor) params.set("cursor", cursor);
        const res = await apiFetch<{ logs: AuditLogRow[]; nextCursor: string | null }>(
          `/api/admin/audit-logs?${params.toString()}`
        );
        setLogs((prev) => (isMore && prev ? [...prev, ...res.logs] : res.logs));
        setNextCursor(res.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load audit logs.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entity, take]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Every sensitive admin action is recorded here — actor, target, IP and metadata."
      />

      <Card className="card-raja">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Filter by entity">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All entities</SelectItem>
                {ENTITY_FILTERS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={take} onValueChange={setTake}>
              <SelectTrigger className="w-full sm:w-32" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading audit logs" />}
          </div>

          {error ? (
            <EmptyState
              icon={<ScrollText />}
              title="Could not load audit logs"
              description={error}
              action={
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          ) : loading && !logs ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <EmptyState
              icon={<ScrollText />}
              title="No audit entries"
              description="Sensitive actions (bans, payment verifications, wallet changes, settings updates) will be recorded here."
            />
          ) : (
            <>
              <div className="max-h-[70vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Entity ID</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Metadata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="cursor-pointer" onClick={() => setDetail(log)}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs" title={log.actorEmail ?? "system"}>
                          {log.actorEmail ?? "system"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.entity}</TableCell>
                        <TableCell className="max-w-[140px] truncate font-mono text-xs" title={log.entityId ?? ""}>
                          {log.entityId ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.ip ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.metadata ? "view" : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {nextCursor && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => void load(nextCursor)} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{detail?.action ?? "Entry"}</DialogTitle>
            <DialogDescription>
              {detail ? `${formatDateTime(detail.createdAt)} by ${detail.actorEmail ?? "system"}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Entity</p>
                  <p className="font-medium">{detail.entity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entity ID</p>
                  <p className="break-all font-mono text-xs">{detail.entityId ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actor ID</p>
                  <p className="break-all font-mono text-xs">{detail.actorId ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IP</p>
                  <p className="font-mono text-xs">{detail.ip ?? "—"}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Metadata</p>
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                  {prettyMetadata(detail.metadata)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
