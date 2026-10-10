/**
 * The smallest of 10, 25, 50 or 100 above the recent peak, so a quiet 2% CPU still draws a visible
 * shape without small noise being blown up into spikes.
 */
export function sparklineCeiling(values: readonly number[]): number {
  const peak = Math.max(0, ...values);
  return [10, 25, 50, 100].find((ceiling) => peak <= ceiling * 0.9) ?? 100;
}
