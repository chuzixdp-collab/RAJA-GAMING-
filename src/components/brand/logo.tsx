import Link from "next/link";
import { Crown } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Golden Glowing Badge */}
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 p-0.5 shadow-md shadow-amber-500/20">
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
          <Crown className="h-4 w-4 text-amber-400" />
        </div>
      </div>
      
      {/* Brand Text */}
      <span className="font-display text-lg font-bold tracking-wider">
        <span className="text-gold-gradient">RAJA</span>{" "}
        <span className="text-foreground">GAMING</span>
      </span>
    </div>
  );
}
