"use client";

/**
 * Shared confirmation dialog for admin mutations with an optional/required
 * note field. Used for bans, rejections, deletes, withdrawals, broadcasts.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  note = false,
  noteRequired = false,
  notePlaceholder = "Note (optional)",
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Render a note textarea (sent as `note` to the API). */
  note?: boolean;
  noteRequired?: boolean;
  notePlaceholder?: string;
  busy?: boolean;
  onConfirm: (noteText: string | undefined) => void | Promise<void>;
}) {
  const [noteText, setNoteText] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setNoteText("");
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {note && (
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={notePlaceholder}
            rows={3}
            maxLength={500}
            aria-label="Note"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || (noteRequired && noteText.trim().length === 0)}
            className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")}
            onClick={(e) => {
              if (noteRequired && noteText.trim().length === 0) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              void Promise.resolve(onConfirm(noteText.trim() || undefined)).finally(() =>
                onOpenChange(false)
              );
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
