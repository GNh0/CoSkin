import { keyframes } from "../core/engine.ts";
import { MediaPlayer } from "./media.js";
import { NativePaintScope } from "./native-paint.js";
const rgba = (color, opacity = 1) => {
  const v = parseInt((color || "#000000").slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${opacity})`;
};
const animationFrames = (effect, element) => {
  const style = getComputedStyle(element);
  return keyframes(effect, {
    opacity: Number(style.opacity),
    filter: style.filter,
  });
};
// Decoration layers stay within the target paint box; native content and input remain intact.
export class Decoration {
  constructor(target, asset) {
    this.target = target;
    // Native overflow clips paint; viewport visibility never writes DOM hidden attributes.
    this.hidden = false;
    this.asset = asset;
    this.layers = {};
    this.animations = [];
    this.restore = [];
    this.players = new Map();
    this.clipAncestors = [];
    for (
      let ancestor = target.el.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY))
        this.clipAncestors.push(ancestor);
    }
    this.nativeRadius = getComputedStyle(
      target.el.querySelector(
        "[data-composer-surface-variant][data-composer-layout]",
      ) || target.el,
    ).borderTopLeftRadius;
    this.originalPosition = target.el.style.position;
    this.originalIsolation = target.el.style.isolation;
    if (getComputedStyle(target.el).position === "static")
      target.el.style.position = "relative";
    target.el.style.isolation = "isolate";
    this.root = document.createElement("div");
    this.root.dataset.coskinDecoration = "";
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "-1",
      overflow: "hidden",
      borderRadius: getComputedStyle(target.el).borderRadius,
    });
    target.el.prepend(this.root);
    for (const name of ["background", "decoration", "border", "icon", "text"]) {
      const el = document.createElement("div");
      el.dataset.coskinLayer = name;
      Object.assign(el.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
      });
      this.root.append(el);
      this.layers[name] = el;
    }
    const icons = [...target.el.querySelectorAll("svg")].filter(
      (svg) =>
        !svg.closest("[data-coskin-decoration],[data-coskin-ui]") &&
        svg.closest('button,[role="button"]') === target.el,
    );
    this.icon = icons.length === 1 ? icons[0] : null;
    this.paintScope = new NativePaintScope();
    this.paintSources = new Map();
    this.paintSurfaces = [];
    if (target.target === "summary.surface") {
      this.summaryStyles = document.createElement("style");
      this.summaryStyles.dataset.coskinUi = "";
      this.summaryStyles.textContent =
        '[data-summary-panel-variant="summary"][data-coskin-summary-paint] header::before { background-color:var(--coskin-summary-header-paint)!important; background-image:none!important; }';
      target.el.append(this.summaryStyles);
    }
    this.updatePaintSurfaces();
  }
  updatePaintSurfaces() {
    const descriptors = this.target.paintSources?.(this.paintSources) || [];
    const current = descriptors.map((source) => source.element);
    for (const [element, original] of this.paintSources) {
      if (current.includes(element)) continue;
      this.restorePaintSurface(original);
      this.paintSources.delete(element);
    }
    for (const source of descriptors) {
      const { element, clearImage, summaryHeader, fileTree } = source;
      this.paintSources.set(element, source);
      if (this.style?.background) {
        const paint = summaryHeader
          ? rgba(
              this.style.background.color,
              this.style.background.opacity ?? 1,
            )
          : "transparent";
        this.paintScope.set(element, "background-color", paint);
        if (summaryHeader)
          this.paintScope.set(element, "--coskin-summary-header-paint", paint);
        if (fileTree) {
          this.paintScope.set(element, "--trees-bg-override", "transparent");
          this.paintScope.set(element, "--color-surface", "transparent");
        }
        if (clearImage)
          this.paintScope.set(element, "background-image", "none");
      }
    }
    this.paintSurfaces = [...this.paintSources.values()];
  }
  set(style = {}) {
    const nextStyle = style || {};
    const fingerprint = JSON.stringify(nextStyle);
    const resolvedMedia = new Map(
      Object.entries(nextStyle)
        .filter(([, value]) => value?.image)
        .map(([name, value]) => [name, this.asset(value.image)]),
    );
    const mediaUnchanged = [...resolvedMedia].every(([name, media]) =>
      media ? this.players.get(name)?.media === media : !this.players.has(name),
    );
    if (this.styleFingerprint === fingerprint && mediaUnchanged) return;
    const needsPosition =
      !this.style ||
      JSON.stringify(this.style.icon) !== JSON.stringify(nextStyle.icon) ||
      (!!nextStyle.icon?.image &&
        this.players.get("icon")?.media !== resolvedMedia.get("icon")) ||
      !!this.target.paintSources;
    this.styleFingerprint = fingerprint;
    this.style = nextStyle;
    if (this.summaryStyles && this.style.background)
      this.target.el.setAttribute("data-coskin-summary-paint", "");
    for (const [name, el] of Object.entries(this.layers)) {
      el.removeAttribute("style");
      Object.assign(el.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
      });
      const v = this.style[name];
      el.style.display = v ? "" : "none";
      const existing = this.players.get(name);
      if (!v) {
        existing?.dispose();
        this.players.delete(name);
        continue;
      }
      if (v.image) {
        const media = resolvedMedia.get(name);
        if (existing?.media === media && media) {
          existing.updateAppearance(
            v.fit || "cover",
            v.position || { x: 0.5, y: 0.5 },
          );
        } else {
          existing?.dispose();
          this.players.delete(name);
          if (media)
            this.players.set(
              name,
              new MediaPlayer(
                media,
                el,
                v.fit || "cover",
                v.position || { x: 0.5, y: 0.5 },
              ),
            );
        }
      } else {
        existing?.dispose();
        this.players.delete(name);
      }
      if (name === "background") {
        el.style.backgroundColor = rgba(v.color, 1);
        el.style.opacity = String(v.opacity ?? 1);
        el.style.filter = `blur(${v.blurPx || 0}px)`;
        this.paintScope.set(
          this.target.el,
          "background-color",
          "transparent",
          "important",
        );
        for (const surface of this.paintSurfaces) {
          this.paintScope.set(
            surface.element,
            "background-color",
            surface.summaryHeader
              ? rgba(v.color, v.opacity ?? 1)
              : "transparent",
            "important",
          );
          if (surface.summaryHeader)
            this.paintScope.set(
              surface.element,
              "--coskin-summary-header-paint",
              rgba(v.color, v.opacity ?? 1),
            );
          if (surface.fileTree) {
            this.paintScope.set(
              surface.element,
              "--trees-bg-override",
              "transparent",
            );
            this.paintScope.set(
              surface.element,
              "--color-surface",
              "transparent",
            );
          }
          if (surface.clearImage)
            this.paintScope.set(
              surface.element,
              "background-image",
              "none",
              "important",
            );
        }
        this.root.style.borderRadius = `${this.style.border?.radiusPx ?? (parseFloat(this.nativeRadius) || 0)}px`;
      } else if (name === "border") {
        el.style.border = `${v.widthPx || 1}px solid ${rgba(v.color, v.opacity)}`;
        el.style.borderRadius = `${v.radiusPx || 0}px`;
        if (v.glow)
          el.style.boxShadow = `0 0 ${v.glow}px ${rgba(v.color, v.opacity)}`;
      } else if (name === "icon") {
        if (!this.icon) {
          el.style.display = "none";
          continue;
        }
        el.style.opacity = String(v.opacity ?? 1);
        if (v.image && this.icon && this.players.has(name)) {
          if (this.iconVisibility === undefined)
            this.iconVisibility = this.icon.style.visibility;
          this.icon.style.visibility = "hidden";
        } else this.restoreIcon();
      } else if (name === "text") {
        el.style.display = "none";
        /* Original text remains accessible and selectable; color is restored on detach. */ if (
          !this.textOriginal
        ) {
          this.textOriginal = {
            color: this.target.el.style.color,
            fontWeight: this.target.el.style.fontWeight,
          };
        }
        this.target.el.style.color = v.color
          ? rgba(v.color, v.opacity)
          : this.textOriginal.color;
        this.target.el.style.fontWeight = v.weight
          ? String(v.weight)
          : this.textOriginal.fontWeight;
      } else el.style.opacity = String(v.opacity ?? 1);
    }
    if (!this.style.background) this.restoreBackground();
    if (!this.style.icon) this.restoreIcon();
    if (!this.style.text) this.restoreText();
    if (needsPosition) this.position();
  }
  position() {
    this.updatePaintSurfaces();
    const r = this.target.el.getBoundingClientRect();
    const wasHidden = this.hidden;
    const icon = this.layers.icon,
      v = this.style?.icon;
    if (v && this.icon) {
      const ir = this.icon.getBoundingClientRect();
      const size = v.sizePx || ir.width;
      Object.assign(icon.style, {
        inset: "auto",
        left: ir.left - r.left + (ir.width - size) / 2 + "px",
        top: ir.top - r.top + (ir.height - size) / 2 + "px",
        width: size + "px",
        height: size + "px",
        padding: (v.paddingPx || 0) + "px",
        backgroundOrigin: "content-box",
        backgroundClip: "content-box",
      });
    }
    let left = Math.max(0, r.left),
      top = Math.max(0, r.top);
    let right = Math.min(innerWidth, r.right),
      bottom = Math.min(innerHeight, r.bottom);
    for (const ancestor of this.clipAncestors) {
      const clip = ancestor.getBoundingClientRect();
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    this.hidden = right <= left || bottom <= top;
    if (
      this.target.target === "composer.surface" &&
      this.paintSurfaces.length
    ) {
      const boxes = this.paintSurfaces.map((surface) =>
        surface.element.getBoundingClientRect(),
      );
      const x = Math.min(...boxes.map((box) => box.left));
      const y = Math.min(...boxes.map((box) => box.top));
      const width = Math.max(...boxes.map((box) => box.right)) - x;
      const height = Math.max(...boxes.map((box) => box.bottom)) - y;
      Object.assign(this.root.style, {
        inset: "auto",
        left: `${x - r.left}px`,
        top: `${y - r.top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    }
    this.setPlaying(this.playRequested);
    for (const player of this.players.values()) player.resize();
    if (this.hidden) this.cancel();
    return wasHidden !== this.hidden;
  }
  play(motion, event, reduce, continuation = new Map()) {
    this.cancel();
    if (
      reduce ||
      motion?.mode !== "effects" ||
      this.target.el.matches(':disabled,[aria-disabled="true"]') ||
      this.hidden ||
      document.hidden
    )
      return;
    for (const effect of motion.events?.[event] || []) {
      for (const el of this.effectTargets(effect)) {
        const frames = animationFrames(effect, el);
        if (continuation.has(effect.layer))
          Object.assign(frames[0], continuation.get(effect.layer));
        const a = el.animate(frames, {
          duration: effect.durationMs,
          delay: effect.delayMs,
          easing: effect.easing,
          iterations:
            effect.iterations === "infinite" ? Infinity : effect.iterations,
          fill: "none",
        });
        this.ownAnimation(a);
      }
    }
    if (event === "enter" && motion.events?.idle?.length) {
      const generation = this.animationGeneration;
      Promise.allSettled(
        this.animations.map((animation) => animation.finished),
      ).then(() => {
        if (
          generation !== this.animationGeneration ||
          this.hidden ||
          document.hidden
        )
          return;
        for (const effect of motion.events.idle) {
          for (const layer of this.effectTargets(effect)) {
            const animation = layer.animate(animationFrames(effect, layer), {
              duration: effect.durationMs,
              delay: effect.delayMs,
              easing: effect.easing,
              iterations:
                effect.iterations === "infinite" ? Infinity : effect.iterations,
              fill: "none",
            });
            this.ownAnimation(animation);
          }
        }
      });
    }
  }
  effectTargets(effect) {
    if (effect.layer === "text") {
      return [...this.target.el.querySelectorAll("span,p,strong,em")].filter(
        (element) =>
          element.children.length === 0 &&
          element.textContent.trim() &&
          !element.closest(
            '[data-coskin-decoration],[data-coskin-ui],[aria-hidden="true"]',
          ),
      );
    }
    const layer = this.layers[effect.layer];
    if (effect.layer === "icon" && layer.style.display === "none" && this.icon)
      return [this.icon];
    if (layer.style.display === "none") return [];
    if (effect.effect === "gradient.move") {
      let gradient = layer.querySelector("[data-coskin-gradient]");
      if (!gradient) {
        gradient = document.createElement("div");
        gradient.dataset.coskinGradient = "";
        Object.assign(gradient.style, {
          position: "absolute",
          inset: "0",
          pointerEvents: "none",
          backgroundImage: `linear-gradient(110deg,transparent,${rgba(this.style[effect.layer]?.color || "#ffffff", 0.3)},transparent)`,
          backgroundSize: "200% 100%",
        });
        layer.append(gradient);
      }
      return [gradient];
    }
    return [layer];
  }
  transition(style, motion, previous, reduce) {
    let exitDuration = 0;
    const continuation = new Map();
    if (this.ghost && !reduce && motion?.mode === "effects")
      for (const effect of motion.events?.enter || []) {
        const element = this.ghost.querySelector(
          `[data-coskin-layer="${effect.layer}"]`,
        );
        if (!element || element.style.display === "none") continue;
        const computed = getComputedStyle(element);
        const properties = [
          ...new Set(
            animationFrames(effect, element).flatMap((frame) =>
              Object.keys(frame).filter((property) => property !== "offset"),
            ),
          ),
        ];
        continuation.set(
          effect.layer,
          Object.fromEntries(
            properties.map((property) => [property, computed[property]]),
          ),
        );
      }
    const paintedLayers = Object.entries(this.style || {}).filter(
      ([, value]) => value && (value.image || value.color),
    );
    const samePaint =
      JSON.stringify(this.style) === JSON.stringify(style) ||
      (paintedLayers.length > 0 &&
        paintedLayers.every(([layer, previous]) => {
          const next = style[layer];
          return (
            next &&
            (previous.image
              ? next.image === previous.image
              : next.color === previous.color)
          );
        }));
    const returnFrames = [];
    if (
      !reduce &&
      samePaint &&
      previous?.mode === "effects" &&
      motion?.mode !== "effects"
    )
      for (const effect of previous.events?.exit || [])
        for (const element of this.effectTargets(effect)) {
          const computed = getComputedStyle(element);
          const properties = [
            ...new Set(
              animationFrames(effect, element).flatMap((frame) =>
                Object.keys(frame).filter((property) => property !== "offset"),
              ),
            ),
          ];
          returnFrames.push({
            element,
            effect,
            properties,
            from: Object.fromEntries(
              properties.map((property) => [property, computed[property]]),
            ),
          });
        }
    let ghost = null;
    if (
      !reduce &&
      !samePaint &&
      previous?.mode === "effects" &&
      (previous.events?.exit || []).length
    ) {
      ghost = this.root.cloneNode(true);
      const sourceCanvases = this.root.querySelectorAll("canvas");
      ghost
        .querySelectorAll("canvas")
        .forEach((canvas, index) =>
          canvas.getContext("2d").drawImage(sourceCanvases[index], 0, 0),
        );
      ghost.removeAttribute("data-coskin-decoration");
      ghost.dataset.coskinTransition = "";
      const originals = [...this.root.children];
      [...ghost.children].forEach((copy, index) => {
        const computed = getComputedStyle(originals[index]);
        for (const property of ["clipPath", "transform", "opacity", "filter"])
          copy.style[property] = computed[property];
      });
    }
    this.cancel();
    this.set(style);
    this.play(motion, "enter", reduce, continuation);
    for (const { element, effect, properties, from } of returnFrames) {
      const computed = getComputedStyle(element);
      const to = Object.fromEntries(
        properties.map((property) => [property, computed[property]]),
      );
      const animation = element.animate([from, to], {
        duration: effect.durationMs,
        delay: 0,
        easing: effect.easing,
        fill: "none",
      });
      this.ownAnimation(animation);
    }
    if (ghost) {
      this.root.after(ghost);
      this.ghost = ghost;
      let duration = 0;
      for (const effect of previous.events.exit) {
        const layer = ghost.querySelector(
          `[data-coskin-layer="${effect.layer}"]`,
        );
        if (!layer || layer.style.display === "none") continue;
        const animation = layer.animate(animationFrames(effect, layer), {
          duration: effect.durationMs,
          delay: effect.delayMs,
          easing: effect.easing,
          iterations: effect.iterations,
          fill: "forwards",
        });
        this.ownAnimation(animation);
        duration = Math.max(
          duration,
          effect.delayMs + effect.durationMs * effect.iterations,
        );
      }
      this.ghostTimer = setTimeout(() => {
        ghost.remove();
        if (this.ghost === ghost) this.ghost = null;
      }, duration);
      exitDuration = duration;
    }
    return exitDuration;
  }
  ownAnimation(animation) {
    this.animations.push(animation);
    if (this.scrollPaused) {
      (this.scrollAnimations ||= new Set()).add(animation);
      animation.pause();
    }
  }
  cancel() {
    this.animationGeneration = (this.animationGeneration || 0) + 1;
    for (const a of this.animations) a.cancel();
    this.animations = [];
    this.scrollAnimations?.clear();
    clearTimeout(this.ghostTimer);
    this.ghost?.remove();
    this.ghost = null;
  }
  setPlaying(play) {
    this.playRequested = play;
    for (const [layer, player] of this.players)
      player.setPlaying(
        play &&
          this.style[layer]?.imagePlayback !== "poster" &&
          !this.hidden &&
          !document.hidden,
      );
  }
  setScrollPaused(value) {
    if (this.scrollPaused === value) return;
    this.scrollPaused = value;
    if (value) {
      this.scrollAnimations = new Set(
        this.animations.filter(
          (animation) => animation.playState === "running",
        ),
      );
      for (const animation of this.scrollAnimations) animation.pause();
    } else {
      for (const animation of this.animations)
        if (
          animation.playState === "paused" &&
          !this.hidden &&
          !document.hidden
        )
          animation.play();
      this.scrollAnimations?.clear();
    }
    for (const player of this.players.values()) player.pause(value);
  }
  restoreIcon() {
    if (this.icon && this.iconVisibility !== undefined) {
      this.icon.style.visibility = this.iconVisibility;
      this.iconVisibility = undefined;
    }
  }
  restoreText() {
    if (this.textOriginal) {
      Object.assign(this.target.el.style, this.textOriginal);
      this.textOriginal = null;
    }
  }
  restoreBackground() {
    if (this.summaryStyles)
      this.target.el.removeAttribute("data-coskin-summary-paint");
    for (const surface of this.paintSurfaces) {
      this.restorePaintSurface(surface);
    }
    this.paintScope.release(this.target.el);
  }
  restorePaintSurface(surface) {
    this.paintScope.release(surface.element);
  }
  dispose() {
    clearTimeout(this.closingTimer);
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
    this.cancel();
    this.restoreIcon();
    this.restoreText();
    this.restoreBackground();
    this.paintScope.dispose();
    this.summaryStyles?.remove();
    if (this.summaryStyles)
      this.target.el.removeAttribute("data-coskin-summary-paint");
    this.root.remove();
    this.target.el.style.position = this.originalPosition;
    this.target.el.style.isolation = this.originalIsolation;
  }
}
