import type { Manifest } from "./contracts.ts";

/** Adding an older feature must never lower an existing media requirement. */
export function requireEngineVersion(manifest: Manifest, minimum: string): void {
  const current = manifest.engine.minVersion.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  const difference = required.findIndex((part, index) => part !== current[index]);
  if (difference >= 0 && required[difference] > current[difference])
    manifest.engine.minVersion = minimum;
}
