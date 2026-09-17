import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of the chart's container, in CSS pixels.
 *
 * The alternative is a fixed `viewBox` that scales to fit, which is less code
 * but scales the text with it: the same chart is 14px type on a desktop and 6px
 * on a phone, or the reverse. Most of this league reads the site on a phone, so
 * the charts are drawn at their real size and the type stays put.
 *
 * Returns `null` until measured, so a caller renders nothing rather than
 * flashing a chart at a wrong width and relaying it.
 */
export const useChartWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Not every browser we care about has ResizeObserver in every context
    // (older iOS Safari, and jsdom in tests). Measure once and stay put rather
    // than failing to render at all.
    if (typeof ResizeObserver === "undefined") {
      setWidth(element.getBoundingClientRect().width || null);
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      // Ignore sub-pixel churn: a 0.5px reflow should not re-render a chart.
      setWidth((current) =>
        current !== null && Math.abs(current - next) < 1 ? current : next
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
};
