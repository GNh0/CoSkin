export type MotionPolicy = "system" | "allow" | "off";
export function isMotionPaused(
  policy: MotionPolicy | undefined,
  reduced: boolean,
  nativePaused: boolean,
): boolean {
  return nativePaused || policy === "off" || (policy !== "allow" && reduced);
}
