import { LOGO_CIRCLE, LOGO_PATHS, LOGO_VIEW_BOX } from "@/lib/logo-shapes";

/** The orbitdash mark, drawn in currentColor so it works on light and dark backgrounds. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEW_BOX}
      className={className}
      fill="currentColor"
      role="img"
      aria-label="orbitdash"
    >
      <circle {...LOGO_CIRCLE} />
      {LOGO_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
