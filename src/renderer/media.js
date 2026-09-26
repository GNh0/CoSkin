import {
  createTimeline,
  advanceTimeline,
  pauseTimeline,
  resumeTimeline,
} from "../core/media-timeline.ts";
import gifWorkerSource from "../../dist/gif-worker.json";
export async function decodeMedia(data, mime) {
  const bytes =
    typeof data === "string"
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : data;
  if (bytes.length > 25 * 1024 * 1024) throw Error("이미지 크기 제한");
  if (mime === "image/gif")
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(
        new Blob([gifWorkerSource], { type: "text/javascript" }),
      );
      let worker;
      try {
        worker = new Worker(url);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
        return;
      }
      const clean = () => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
      };
      const timer = setTimeout(() => {
        clean();
        reject(Error("GIF 디코딩 시간이 초과되었습니다."));
      }, 5000);
      worker.onerror = () => {
        clean();
        reject(Error("GIF 디코딩에 실패했습니다."));
      };
      worker.onmessage = (event) => {
        clean();
        if (!event.data.ok) {
          reject(Error(event.data.error));
          return;
        }
        resolve({
          mime,
          width: event.data.width,
          height: event.data.height,
          frames: event.data.frames,
          loops: event.data.loops,
        });
      };
      worker.postMessage(bytes.buffer, [bytes.buffer]);
    });
  const image = await createImageBitmap(new Blob([bytes], { type: mime }));
  if (
    !image.width ||
    !image.height ||
    image.width > 16384 ||
    image.height > 16384 ||
    image.width * image.height > 32000000
  ) {
    image.close();
    throw Error("이미지 크기 제한");
  }
  return {
    mime,
    width: image.width,
    height: image.height,
    frames: [{ image, delay: 0 }],
  };
}
const activePlayers = new Set();
const pausedPlayers = new Set();
const timelines = new WeakMap();
let clockTimer = null;
const scheduleClock = () => {
  clearTimeout(clockTimer);
  if (!activePlayers.size) {
    clockTimer = null;
    return;
  }
  let wait = 1000;
  const now = performance.now();
  const advanced = new Set();
  for (const player of activePlayers) {
    const timeline = timelines.get(player.media);
    if (!advanced.has(player.media) && now >= timeline.next) {
      advanceTimeline(
        timeline,
        (player.media.delays ||= player.media.frames.map(
          (frame) => frame.delay,
        )),
        player.media.loops || 0,
        now,
      );
      if (timeline.ended) {
        for (const candidate of activePlayers)
          if (candidate.media === player.media) activePlayers.delete(candidate);
        continue;
      }
      advanced.add(player.media);
    }
    if (player.lastFrame !== timeline.index) {
      player.index = timeline.index;
      player.draw();
    }
    wait = Math.min(wait, Math.max(20, timeline.next - now));
  }
  clockTimer = activePlayers.size ? setTimeout(scheduleClock, wait) : null;
};
export class MediaPlayer {
  constructor(media, parent, fit = "contain", position = { x: 0.5, y: 0.5 }) {
    this.media = media;
    this.parent = parent;
    this.canvas = document.createElement("canvas");
    const rect = parent.getBoundingClientRect();
    const scale = Math.min(
      1,
      Math.sqrt(1048576 / Math.max(1, rect.width * rect.height)),
    );
    this.canvas.width = Math.max(1, Math.round(rect.width * scale));
    this.canvas.height = Math.max(1, Math.round(rect.height * scale));
    this.fit = fit;
    this.position = position;
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    parent.append(this.canvas);
    this.context = this.canvas.getContext("2d");
    this.index = 0;
    this.loops = 0;
    this.draw();
  }
  draw() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cw = this.canvas.width,
      ch = this.canvas.height,
      m = this.media;
    let width = cw,
      height = ch;
    if (this.fit !== "stretch") {
      const scale =
        this.fit === "cover"
          ? Math.max(cw / m.width, ch / m.height)
          : Math.min(cw / m.width, ch / m.height);
      width = m.width * scale;
      height = m.height * scale;
    }
    this.context.drawImage(
      m.frames[this.index].image,
      (cw - width) * this.position.x,
      (ch - height) * this.position.y,
      width,
      height,
    );
    this.lastFrame = this.index;
  }
  updateAppearance(fit, position) {
    if (
      this.fit === fit &&
      this.position.x === position.x &&
      this.position.y === position.y
    )
      return;
    this.fit = fit;
    this.position = position;
    this.draw();
  }
  resize() {
    const rect = this.parent.getBoundingClientRect();
    const scale = Math.min(
      1,
      Math.sqrt(1048576 / Math.max(1, rect.width * rect.height)),
    );
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }
  setPlaying(play) {
    this.playRequested = play;
    if (this.media.frames.length < 2) return;
    if (play && this.scrollPaused) {
      pausedPlayers.add(this);
      return;
    }
    if (!play) {
      pausedPlayers.delete(this);
      const wasPlaying = activePlayers.delete(this);
      if (wasPlaying && !activePlayers.size) {
        clearTimeout(clockTimer);
        clockTimer = null;
      }
      if (
        ![...activePlayers, ...pausedPlayers].some(
          (player) => player.media === this.media,
        )
      )
        timelines.delete(this.media);
      if (this.index === 0) return;
      this.index = 0;
      this.draw();
      return;
    }
    if (activePlayers.has(this)) return;
    if (!timelines.has(this.media))
      timelines.set(
        this.media,
        createTimeline(performance.now(), this.media.frames[0].delay),
      );
    if (timelines.get(this.media).ended) {
      this.index = this.media.frames.length - 1;
      if (this.lastFrame !== this.index) this.draw();
      return;
    }
    activePlayers.add(this);
    if (!clockTimer) scheduleClock();
  }
  pause(value) {
    if (this.scrollPaused === value || this.media.frames.length < 2) return;
    this.scrollPaused = value;
    const timeline = timelines.get(this.media);
    if (value) {
      if (this.playRequested) pausedPlayers.add(this);
      activePlayers.delete(this);
      if (
        timeline &&
        ![...activePlayers].some((player) => player.media === this.media)
      )
        pauseTimeline(timeline, performance.now());
      if (!activePlayers.size) {
        clearTimeout(clockTimer);
        clockTimer = null;
      }
    } else {
      pausedPlayers.delete(this);
      if (timeline?.pausedAt !== undefined) {
        resumeTimeline(timeline, performance.now());
      }
      this.setPlaying(this.playRequested);
    }
  }
  dispose() {
    pausedPlayers.delete(this);
    this.setPlaying(false);
    this.canvas.remove();
  }
}
