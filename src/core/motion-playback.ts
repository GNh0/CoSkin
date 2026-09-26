import type { Effect, Motion } from "./contracts.ts";

export function playbackBudget(motion: Motion | null | undefined): number {
  if (motion?.mode !== "effects") return 0;
  const end = (effects: Effect[] = []) =>
    Math.max(
      0,
      ...effects.map((effect) =>
        effect.iterations === "infinite"
          ? 8000
          : effect.delayMs + effect.durationMs * effect.iterations,
      ),
    );
  return end(motion.events?.enter) + end(motion.events?.idle);
}
