"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function Gallery({
  images,
  title,
}: {
  images: { uploadId: string }[];
  title: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-border bg-card/40 text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <ImageOff className="h-10 w-10" aria-hidden="true" />
          <p className="text-sm">No screenshots provided for this listing.</p>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(active, images.length - 1);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border bg-black/40">
        <img
          src={`/api/uploads/${images[safeIndex].uploadId}`}
          alt={`${title} — screenshot ${safeIndex + 1} of ${images.length}`}
          className="aspect-[4/3] w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" role="listbox" aria-label="Listing screenshots">
          {images.map((image, idx) => (
            <button
              key={image.uploadId}
              type="button"
              role="option"
              aria-selected={idx === safeIndex}
              aria-label={`View screenshot ${idx + 1}`}
              onClick={() => setActive(idx)}
              className={cn(
                "overflow-hidden rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                idx === safeIndex
                  ? "border-primary/70 ring-1 ring-primary/50"
                  : "border-border opacity-70 hover:opacity-100"
              )}
            >
              <img
                src={`/api/uploads/${image.uploadId}`}
                alt={`${title} — thumbnail ${idx + 1}`}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
