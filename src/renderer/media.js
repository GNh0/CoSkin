import {
  createTimeline,
  advanceTimeline,
  pauseTimeline,
  resumeTimeline,
} from "../core/media-timeline.ts";
import gifWorkerSource from "../../dist/gif-worker.json";
import { MEDIA_LIMITS, isVideoMime } from "../core/media-limits.js";
export function disposeMedia(media) {
  if (media.disposed) return;
  media.disposed = true;
  for (const frame of media.frames) frame.image.close();
  if (media.videoUrl && !media.releaseSource) URL.revokeObjectURL(media.videoUrl);
  media.releaseSource?.();
}
async function decodeVideo(bytes, mime, poster = null, directURL = false) {
  const blob = directURL ? null : bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const videoUrl = directURL ? bytes : URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  if (directURL) video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.dataset.coskinUi = "";
  Object.assign(video.style, {
    position: "fixed",
    left: "-9999px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(video);
  try {
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        video.onloadedmetadata = video.onerror = null;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () => finish(Error("영상 디코딩 시간이 초과되었습니다.")),
        10000,
      );
      video.onloadedmetadata = () => finish();
      video.onerror = () => finish(Error("영상을 재생할 수 없습니다."));
      video.src = videoUrl;
      // Chromium defers an unconnected, paused video's first frame in hidden windows.
      video.play().catch(finish);
    });
    if (
      !video.videoWidth ||
      !video.videoHeight ||
      video.videoWidth > MEDIA_LIMITS.dimension ||
      video.videoHeight > MEDIA_LIMITS.dimension ||
      video.videoWidth * video.videoHeight > MEDIA_LIMITS.pixels ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.duration * 1000 > MEDIA_LIMITS.maxDurationMs
    )
      throw Error("영상 해상도 또는 길이 제한을 초과했습니다.");
    if (!poster) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        video.onseeked = null;
        reject(Error("영상 미리보기를 준비하지 못했습니다."));
      }, 10000);
      video.onseeked = () => {
        clearTimeout(timer);
        video.onseeked = null;
        resolve();
      };
      video.currentTime = Math.min(15, video.duration * 0.15);
    });
    const image = poster || await createImageBitmap(video);
    return {
      mime,
      width: video.videoWidth,
      height: video.videoHeight,
      frames: [{ image, delay: 0 }],
      videoUrl,
      duration: video.duration,
      encodedBytes: blob?.size || 0,
    };
  } catch (error) {
    if (!directURL) URL.revokeObjectURL(videoUrl);
    poster?.close();
    throw error;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}
export const decodeVideoURL = (url, mime, poster) => decodeVideo(url, mime, poster, true);
export async function decodeMedia(data, mime, poster = null) {
  if (data instanceof Blob) {
    if (data.size > (isVideoMime(mime) ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.bytes))
      throw Error("미디어 파일 크기 제한을 초과했습니다.");
    if (isVideoMime(mime)) return decodeVideo(data, mime, poster);
    data = new Uint8Array(await data.arrayBuffer());
  }
  const bytes =
    typeof data === "string"
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : data;
  const video = isVideoMime(mime);
  if (bytes.length > (video ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.bytes))
    throw Error(
      video ? "영상 파일 크기 제한을 초과했습니다." : "이미지 크기 제한",
    );
  if (video) return decodeVideo(bytes, mime, poster);
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
    if (media.videoUrl) {
      this.video = document.createElement("video");
      this.video.muted = true;
      this.video.loop = true;
      this.video.playsInline = true;
      this.video.preload = "none";
      Object.assign(this.video.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        display: "none",
      });
      this.videoAppearance();
      parent.append(this.video);
    }
  }
  videoAppearance() {
    if (!this.video) return;
    this.video.style.objectFit = this.fit === "stretch" ? "fill" : this.fit;
    this.video.style.objectPosition =
      this.position.x * 100 + "% " + this.position.y * 100 + "%";
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
  snapshot(canvas) {
    canvas.style.visibility = "visible";
    if (
      !this.video ||
      this.video.readyState < 2 ||
      this.video.style.display === "none"
    ) {
      canvas.getContext("2d").drawImage(this.canvas, 0, 0);
      return;
    }
    const scale =
      this.fit === "stretch"
        ? null
        : this.fit === "cover"
          ? Math.max(
              canvas.width / this.media.width,
              canvas.height / this.media.height,
            )
          : Math.min(
              canvas.width / this.media.width,
              canvas.height / this.media.height,
            );
    const width = scale === null ? canvas.width : this.media.width * scale;
    const height = scale === null ? canvas.height : this.media.height * scale;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      this.video,
      (canvas.width - width) * this.position.x,
      (canvas.height - height) * this.position.y,
      width,
      height,
    );
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
    this.videoAppearance();
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
    if (this.video) {
      if (play && !this.visibilityPaused) {
        if (!this.videoSourceSet) {
          this.video.src = this.media.videoUrl;
          this.videoSourceSet = true;
        }
        if (!this.video.paused) return;
        this.video
          .play()
          .then(() => {
            if (this.disposed || !this.playRequested || this.visibilityPaused) {
              this.video.pause();
              return;
            }
            if (!this.video.paused) {
              this.video.style.display = "block";
              this.canvas.style.visibility = "hidden";
            }
          })
          .catch(() => {
            if (!this.disposed && this.video.paused) {
              this.video.style.display = "none";
              this.canvas.style.visibility = "visible";
            }
          });
      } else if (!play) {
        this.video.pause();
        if (this.video.readyState) this.video.currentTime = 0;
        this.video.style.display = "none";
        this.canvas.style.visibility = "visible";
      }
      return;
    }
    if (this.media.frames.length < 2) return;
    if (play && (this.scrollPaused || this.visibilityPaused)) {
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
    // Native video playback runs independently of the GIF redraw clock during scrolling.
    if (this.video) return;
    if (this.scrollPaused === value) return;
    this.scrollPaused = value;
    this.refreshPause();
  }
  setVisible(visible) {
    const value = !visible;
    if (this.visibilityPaused === value) return;
    this.visibilityPaused = value;
    if (this.video) {
      if (value) this.video.pause();
      else this.setPlaying(this.playRequested);
    } else this.refreshPause();
  }
  refreshPause() {
    const value = !!(this.scrollPaused || this.visibilityPaused);
    if (this.clockPaused === value || this.media.frames.length < 2) return;
    this.clockPaused = value;
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
    this.disposed = true;
    pausedPlayers.delete(this);
    this.setPlaying(false);
    if (this.video) {
      this.video.removeAttribute("src");
      this.video.load();
      this.video.remove();
    }
    this.canvas.width = this.canvas.height = 0;
    this.canvas.remove();
  }
}
