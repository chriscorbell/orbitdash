import { useId } from "react";

interface SparklineProps {
  className?: string;
  /** Values on a 0 to `max` scale, oldest first. */
  values: readonly number[];
  max?: number;
  /** How many points the line spans, so a short history starts at the right edge. */
  capacity?: number;
}

const WIDTH = 100;
const HEIGHT = 32;

/** A small filled line chart drawn in currentColor; cheap enough to re-render every second. */
export function Sparkline({ className, values, max = 100, capacity = 60 }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) {
    return <svg className={className} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" />;
  }

  const step = WIDTH / Math.max(capacity - 1, 1);
  const offset = WIDTH - step * (values.length - 1);
  const points = values.map((value, index) => {
    const clamped = Math.min(Math.max(value, 0), max);
    const x = offset + index * step;
    const y = HEIGHT - 2 - (clamped / max) * (HEIGHT - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${WIDTH},${HEIGHT} L${offset.toFixed(2)},${HEIGHT} Z`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
