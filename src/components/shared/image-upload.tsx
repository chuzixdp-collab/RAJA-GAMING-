"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/client";

export function ImageUpload({
  kind,
  value,
  onChange,
  label = "Upload screenshot",
  className,
  disabled,
}: {
  kind: "PAYMENT_PROOF" | "LISTING_SCREENSHOT" | "ID_VERIFICATION" | "OTHER";
  value?: string | null; // upload id
  onChange: (uploadId: string | null) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    value ? `/api/uploads/${value}` : null
  );

  async function handleFile(file: File) {
    if (disabled || busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Only PNG, JPG or WebP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large — maximum size is 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadImage(file, kind);
      onChange(result.id);
      setPreviewUrl(result.url);
      toast.success("Screenshot uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          <img src={previewUrl} alt="Uploaded screenshot preview" className="max-h-48 w-full object-contain bg-black/40" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute right-2 top-2 h-8 w-8"
            onClick={clear}
            aria-label="Remove screenshot"
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
          )}
          <span>{busy ? "Uploading…" : label}</span>
          <span className="text-xs">PNG, JPG or WebP — max 5 MB</span>
        </button>
      )}
    </div>
  );
}
