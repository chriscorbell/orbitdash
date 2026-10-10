// @vitest-environment happy-dom

import { act, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useTweenedNumber } from "@/hooks/useTweenedNumber";

function mockReducedMotion(reduce: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: reduce,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media)
  );
  return (next: boolean) => {
    media.matches = next;
    listeners.forEach((listener) => listener());
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePrefersReducedMotion", () => {
  it("follows the OS setting as it changes", () => {
    const change = mockReducedMotion(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => change(true));
    expect(result.current).toBe(true);
  });
});

describe("useTweenedNumber", () => {
  it("glides to a new value over the duration", () => {
    mockReducedMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { result, rerender } = renderHook(({ value }) => useTweenedNumber(value, 400), {
      initialProps: { value: 10 as number | null },
    });
    expect(result.current).toBe(10);

    rerender({ value: 50 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBeGreaterThan(10);
    expect(result.current).toBeLessThan(50);

    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe(50);
  });

  it("jumps straight there with reduced motion or from nothing", () => {
    mockReducedMotion(true);
    const { result, rerender } = renderHook(({ value }) => useTweenedNumber(value), {
      initialProps: { value: null as number | null },
    });
    expect(result.current).toBeNull();
    rerender({ value: 30 });
    expect(result.current).toBe(30);
    rerender({ value: 70 });
    expect(result.current).toBe(70);
  });
});

describe("useFlipAnimation", () => {
  function Board({ order }: { order: string[] }) {
    const ref = useFlipAnimation<HTMLDivElement>();
    return (
      <div ref={ref}>
        {order.map((key) => (
          <div key={key} data-flip-key={key} data-testid={key} />
        ))}
      </div>
    );
  }

  function stubLayout(positions: Record<string, number>) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      const top = positions[this.dataset.flipKey ?? ""] ?? 0;
      return {
        left: 0,
        top,
        x: 0,
        y: top,
        width: 10,
        height: 10,
        right: 10,
        bottom: top + 10,
      } as DOMRect;
    });
  }

  it("animates moved elements from their old spot with transforms only", () => {
    mockReducedMotion(false);
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    stubLayout({ a: 0, b: 50 });
    const { rerender } = render(<Board order={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled();

    stubLayout({ a: 50, b: 0 });
    rerender(<Board order={["b", "a"]} />);

    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0][0]).toEqual([
      { transform: "translate(0px, 50px)" },
      { transform: "translate(0, 0)" },
    ]);
  });

  it("measures past its own running animation and continues from where things show", () => {
    mockReducedMotion(false);
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    const cancel = vi.fn();
    stubLayout({ a: 0 });
    const { rerender } = render(<Board order={["a"]} />);

    // Mid-animation the element shows 20px below its layout spot of 100.
    let measurements = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      const isA = this.dataset.flipKey === "a";
      const top = isA ? (measurements++ === 0 ? 120 : 100) : 0;
      return {
        left: 0,
        top,
        x: 0,
        y: top,
        width: 10,
        height: 10,
        right: 10,
        bottom: top + 10,
      } as DOMRect;
    });
    HTMLElement.prototype.getAnimations = (() => [
      { id: "orbitdash-flip", cancel },
    ]) as unknown as typeof HTMLElement.prototype.getAnimations;
    rerender(<Board order={["a"]} />);

    expect(cancel).toHaveBeenCalled();
    // From its old spot (0) plus the 20px it was still offset, to its new spot (100).
    expect(animate.mock.calls.at(-1)![0][0]).toEqual({ transform: "translate(0px, -80px)" });
    delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
  });

  it("stays still when reduced motion is preferred or nothing moved", () => {
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    mockReducedMotion(false);
    stubLayout({ a: 0 });
    const { rerender } = render(<Board order={["a"]} />);
    rerender(<Board order={["a"]} />);
    expect(animate).not.toHaveBeenCalled();

    mockReducedMotion(true);
    stubLayout({ a: 40 });
    rerender(<Board order={["a"]} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
