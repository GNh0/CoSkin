import type { Binding } from "./contracts.ts";

export function revisionStatus(
  id: string,
  savedRevision: number,
  dirty: boolean,
  enabled: boolean,
  binding: Binding | undefined,
): "unsavedChanges" | "savedApplied" | "savedNotApplied" {
  if (dirty) return "unsavedChanges";
  return enabled && binding?.id === id && binding.revision === savedRevision
    ? "savedApplied"
    : "savedNotApplied";
}
