"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Mail, Pencil, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TABS = ["NEW", "READ", "REPLIED", "CLOSED"] as const;

type ContactAction = "MARK_READ" | "REPLIED" | "CLOSED" | "NOTE" | "DELETE";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<Exclude<ContactAction, "NOTE" | "DELETE">, string> = {
  MARK_READ: "Mark read",
  REPLIED: "Mark replied",
  CLOSED: "Close",
};

export function ContactView() {
  const [messages, setMessages] = useState<ContactRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("NEW");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<ContactRow | null>(null);
  const [noteText, setNoteText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ messages: ContactRow[] }>("/api/admin/contact");
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages.");
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: messages?.length ?? 0 };
    for (const s of TABS) c[s] = 0;
    for (const m of messages ?? []) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [messages]);

  const filtered = useMemo(
    () => (messages ?? []).filter((m) => tab === "ALL" || m.status === tab),
    [messages, tab]
  );

  async function act(message: ContactRow, action: ContactAction, note?: string) {
    setBusyId(message.id);
    try {
      await apiFetch("/api/admin/contact", {
        method: "PATCH",
        json: { messageId: message.id, action, ...(note ? { note } : {}) },
      });
      if (action !== "DELETE") toast.success(`${ACTION_LABELS[action as Exclude<ContactAction, "NOTE" | "DELETE">]}: done.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch("/api/admin/contact", {
        method: "PATCH",
        json: { messageId: deleteTarget.id, action: "DELETE" },
      });
      toast.success("Message deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete message.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contact messages"
        description="Messages submitted from the public contact form."
      />

      <Alert className="mb-6 border-primary/30 bg-primary/5">
        <Mail className="h-4 w-4 text-primary" aria-hidden />
        <AlertTitle>Reply directly via email</AlertTitle>
        <AlertDescription>
          There is no in-app reply box — answer the sender using your own email client. Click the
          sender&apos;s address below to open a draft, then mark the message as REPLIED once
          answered.
        </AlertDescription>
      </Alert>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Message summary">
        {TABS.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">{s}</span>
            <span className="font-display font-bold text-primary">{counts[s] ?? 0}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">All</span>
          <span className="font-display font-bold text-primary">{counts.ALL}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s} ({counts[s] ?? 0})
            </TabsTrigger>
          ))}
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
        </TabsList>
      </Tabs>

      {messages === null ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load messages" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title="No messages here"
          description={
            tab === "ALL"
              ? "Contact form submissions will appear here."
              : "No messages with this status."
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((message) => (
            <Card key={message.id} className="card-raja p-0">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium leading-snug">{message.subject}</h3>
                    <p className="mt-0.5 text-sm">
                      {message.name}{" "}
                      <a
                        href={`mailto:${message.email}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {message.email}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={message.status} />
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(message.createdAt)} • {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm">
                  {message.message}
                </p>

                {message.adminNotes && (
                  <p className="mt-2 rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-xs text-amber-500">
                    <span className="font-medium">Admin notes:</span> {message.adminNotes}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                  {message.status === "NEW" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === message.id}
                      onClick={() => void act(message, "MARK_READ")}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Mark read
                    </Button>
                  )}
                  {message.status !== "REPLIED" && message.status !== "CLOSED" && (
                    <Button
                      size="sm"
                      disabled={busyId === message.id}
                      onClick={() => void act(message, "REPLIED")}
                    >
                      {busyId === message.id && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                      )}
                      Mark replied
                    </Button>
                  )}
                  {message.status !== "CLOSED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === message.id}
                      onClick={() => void act(message, "CLOSED")}
                    >
                      Close
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === message.id}
                    onClick={() => {
                      setNoteText(message.adminNotes ?? "");
                      setNoteTarget(message);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Note
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    disabled={busyId === message.id}
                    onClick={() => setDeleteTarget(message)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* NOTE dialog */}
      <Dialog
        open={noteTarget !== null}
        onOpenChange={(o) => !o && setNoteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Admin note</DialogTitle>
            <DialogDescription>Internal note on this message thread.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="contact-note">Note</Label>
            <Textarea
              id="contact-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Internal note..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!noteTarget) return;
                const target = noteTarget;
                setNoteTarget(null);
                void act(target, "NOTE", noteText);
              }}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.subject}&quot; from {deleteTarget?.email} will be permanently
              deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
