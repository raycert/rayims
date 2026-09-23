export type Tone = "success" | "warning" | "danger" | "neutral";

export function clientStatusLabel(status: string): string {
  return status === "active" ? "Active" : "Inactive";
}
export function clientStatusTone(status: string): Tone {
  return status === "active" ? "success" : "neutral";
}

const PROJECT_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};
const PROJECT_TONES: Record<string, Tone> = {
  planning: "neutral",
  active: "success",
  on_hold: "warning",
  completed: "success",
  archived: "neutral",
};

/** Falls back to the raw value for a status not yet in the map (forward-compatible). */
export function projectStatusLabel(status: string): string {
  return PROJECT_LABELS[status] ?? status;
}
export function projectStatusTone(status: string): Tone {
  return PROJECT_TONES[status] ?? "neutral";
}
