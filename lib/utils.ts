import { clsx, type ClassValue } from "clsx";
import type { MouseEvent } from "react";

/** Join class names, skipping falsy values. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Native <input type="date"/"time"> only reliably opens its picker when the
 * calendar/clock icon is clicked; clicking elsewhere in the field just places a text
 * cursor. showPicker() makes a click anywhere in the field open it too.
 * Feature-detected (Firefox/Safari lack it as of this writing) and wrapped in
 * try/catch (throws if not called from a direct user gesture in some browser
 * states) — the native click-to-focus/type behavior is the fallback either way, so
 * this is purely additive.
 */
export function openNativePicker(e: MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
    } catch {
      // Fallback: default click-to-focus behavior still applies.
    }
  }
}
