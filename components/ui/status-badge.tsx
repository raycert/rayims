import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/ui/status-tones";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
};

/** Color reinforces meaning but never carries it alone: always paired with a text label. */
export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold",
        TONE_CLASSES[tone],
      )}
    >
      {label}
    </span>
  );
}
