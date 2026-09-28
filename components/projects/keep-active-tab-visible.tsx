"use client";

import { useEffect, useRef } from "react";

/**
 * Rendered inside the project tab bar: on narrow screens the bar scrolls horizontally (it never
 * wraps), so a tab near the end (e.g. Documents at 390px) could start off-screen. This scrolls
 * the bar just enough to show the active tab (`aria-current="page"`). No effect when it fits.
 */
export function KeepActiveTabVisible() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = ref.current?.parentElement;
    const active = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!bar || !active) return;
    const b = bar.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.right > b.right) bar.scrollLeft += a.right - b.right + 16;
  }, []);
  return <span ref={ref} hidden />;
}
