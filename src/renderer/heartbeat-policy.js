// A secondary Codex window can take longer than one host scan to initialize.
// Keep the first window alive while its verified host finishes that work.
export const HEARTBEAT_TIMEOUT_MS = 60_000;

export function heartbeatExpired(now, lastHeartbeat) {
  return now - lastHeartbeat > HEARTBEAT_TIMEOUT_MS;
}
