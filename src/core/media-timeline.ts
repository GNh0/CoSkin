export interface Timeline {
  index: number;
  next: number;
  completedLoops: number;
  ended: boolean;
  pausedAt?: number;
}
export function createTimeline(now: number, firstDelay: number): Timeline {
  return { index: 0, next: now + firstDelay, completedLoops: 0, ended: false };
}
/** Returns true when a new frame should be painted; finite GIFs retain their final frame. */
export function advanceTimeline(
  timeline: Timeline,
  delays: readonly number[],
  loops: number,
  now: number,
): boolean {
  if (timeline.ended || timeline.pausedAt !== undefined || now < timeline.next)
    return false;
  if (timeline.index === delays.length - 1) {
    timeline.completedLoops++;
    if (loops > 0 && timeline.completedLoops >= loops) {
      timeline.ended = true;
      return false;
    }
  }
  timeline.index = (timeline.index + 1) % delays.length;
  timeline.next = now + delays[timeline.index];
  return true;
}
export function pauseTimeline(timeline: Timeline, now: number): void {
  if (timeline.pausedAt === undefined) timeline.pausedAt = now;
}
export function resumeTimeline(timeline: Timeline, now: number): void {
  if (timeline.pausedAt === undefined) return;
  timeline.next += Math.max(0, now - timeline.pausedAt);
  delete timeline.pausedAt;
}
