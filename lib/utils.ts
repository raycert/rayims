import { clsx, type ClassValue } from "clsx";

/** Join class names, skipping falsy values. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
