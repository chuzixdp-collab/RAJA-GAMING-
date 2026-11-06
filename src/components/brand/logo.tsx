import { useId } from "react";

/**
 * RAJA GAMING — "RG" monogram.
 *
 * A single recognisable mark: interlocked angular R + G under a small
 * three-peak crown with a red gem. Metallic gradient strokes with a dark
 * extrude layer (3D depth) and a thin bevel highlight, set on a dark
 * panel with a silver rim. Colours follow the active theme via CSS
 * variables, so the mark restyles itself on every theme.
 *
 * Variants:
 *  - <Logo />            header wordmark + monogram (public nav, shells, footer)
 *  - <LogoMark />        compact monogram only (mobile headers, small spaces)
 *  - <RajaMonogram />    raw scalable SVG (loading screen, custom sizes)
 */

type MonogramProps = {
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
  /** Accessible name; omit for decorative usage. */
  title?: string;
};

const R_PATHS = [
  "M13.5 53 V26.5 H26 L30.8 30.8 V36.4 L26 40.5 H13.5",
  "M26.5 41 L33.5 53.5",
  "M52.5 27.5 L48.5 23.5 H39 L35 27.5 V50.5 L39 54.5 H48.5 L52.5 50.5 V41.5 H45",
];

export function RajaMonogram({ size = 36, className, title }: MonogramProps) {
  // Unique gradient ids per instance (multiple logos can render on one page).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gMetal = `rgMetal${uid}`;
  const gCrown = `rgCrown${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <defs>
        <linearGradient id={gMetal} x1="14" y1="22" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--gold-grad-1, #f7d774)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--gold-grad-2, #f5b90b)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold-grad-3, #d99a00)" }} />
        </linearGradient>
        <linearGradient id={gCrown} x1="20" y1="6" x2="44" y2="19" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--gold-grad-1, #f7d774)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold-grad-2, #f5b90b)" }} />
        </linearGradient>
      </defs>

      {/* Dark panel with silver rim */}
      <rect
        x="1.25"
        y="1.25"
        width="61.5"
        height="61.5"
        rx="14"
        style={{ fill: "var(--logo-panel, #0b0b0e)" }}
        stroke="#9aa0aa"
        strokeOpacity="0.55"
        strokeWidth="2.5"
      />

      {/* Crown */}
      <path
        d="M19 18.5 L22.5 9.5 L27.5 14.5 L32 7.5 L36.5 14.5 L41.5 9.5 L45 18.5 Z"
        fill={`url(#${gCrown})`}
        stroke="#8a6d10"
        strokeWidth="1"
      />
      {/* Red gem */}
      <circle cx="32" cy="14.4" r="1.8" fill="#ff3b46" stroke="#7f1d1d" strokeWidth="0.6" />

      {/* Extrude layer — 3D depth */}
      <g
        stroke="var(--gold-grad-3, #8a6d10)"
        strokeWidth="5.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
        opacity="0.85"
        transform="translate(2.4 2.4)"
      >
        {R_PATHS.map((d) => (
          <path key={`x${d}`} d={d} />
        ))}
      </g>

      {/* Front metallic strokes */}
      <g
        stroke={`url(#${gMetal})`}
        strokeWidth="5.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      >
        {R_PATHS.map((d) => (
          <path key={`f${d}`} d={d} />
        ))}
      </g>

      {/* Bevel highlight */}
      <g
        stroke="rgba(255,255,255,0.26)"
        strokeWidth="1.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
        transform="translate(-0.9 -1.5)"
      >
        {R_PATHS.map((d) => (
          <path key={`h${d}`} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** Compact monogram — mobile headers and tight spaces. */
export function LogoMark({ size = 30, className, title }: MonogramProps) {
  return <RajaMonogram size={size} className={className} title={title} />;
}

/** Full header lockup — monogram + RAJA GAMING wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <RajaMonogram size={34} />
      <span className="font-display text-lg font-bold tracking-wider">
        <span className="text-gold-gradient">RAJA</span> <span className="text-foreground">GAMING</span>
      </span>
    </div>
  );
}
