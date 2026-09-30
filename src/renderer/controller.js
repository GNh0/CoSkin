import {
  pauseMediaForSidebarScroll,
  sidebarForScroll,
} from "./scroll-media-policy.js";
import { applyThemeTypography } from "./theme-typography.js";
import { heartbeatExpired } from "./heartbeat-policy.js";
import { mediaMemoryBytes, mediaCacheBudget } from "../core/media-budget.js";
import { t } from "./messages.js";
import { downloadBytes } from "./file-transfer.js";
import { isMotionPaused } from "../core/motion-policy.ts";
import { validateCustomEffects } from "../core/custom-effects.ts";
import { playbackBudget } from "../core/motion-playback.ts";
import {
  defaultThemes,
  previousDefaultThemes,
} from "../core/default-themes.ts";
import { localizedFailure } from "./error-messages.js";
import { applicationLocale, observeApplicationLocale } from "./locale.js";
import {
  resolve,
  validateTheme,
  validateManifest,
  capabilities,
} from "../core/engine.ts";
import { CodexAdapter } from "./adapter.js";
import { Decoration } from "./layers.js";
import { mutationNeedsDiscovery } from "./mutation-impact.js";
import { Panel } from "./panel.js";
import { decodeMedia, disposeMedia } from "./media.js";
export async function decodeImage(data, mime) {
  const media = await decodeMedia(data, mime);
  disposeMedia(media);
  return true;
}
export async function validateDocument(doc) {
  const m = validateManifest(doc.manifest);
  validateTheme(
    doc.theme,
    Object.keys(doc.assets || {}),
    false,
    new Set(m.requirements.optional),
  );
  if (doc.localOverrides) {
    for (const [profile, rules] of Object.entries(doc.localOverrides)) {
      if (!doc.theme.profiles.some((p) => p.id === profile))
        throw Error("개별 항목의 프로필 오류");
      validateTheme(
        {
          profiles: [{ id: profile, name: "개별 항목", rules }],
          customEffects: doc.theme.customEffects,
        },
        Object.keys(doc.assets),
        true,
      );
    }
  }
  if (
    m.format !== "coskin.theme" ||
    m.formatVersion !== 1 ||
    m.entry !== "theme.json" ||
    !doc.theme.profiles.some((p) => p.id === m.defaultProfile)
  )
    throw Error("테마 형식 또는 기본 프로필 오류");
  const minimum = m.engine.minVersion.split(".").map(Number);
  const current = [0, 1, 2];
  const difference = minimum.findIndex(
    (part, index) => part !== current[index],
  );
  if (difference >= 0 && minimum[difference] > current[difference])
    throw Error("이 테마에 필요한 엔진 버전을 지원하지 않습니다.");
  const used = new Set();
  for (const p of doc.theme.profiles)
    for (const r of p.rules) {
      used.add("target:" + r.target);
      for (const s of Object.values(r.states))
        for (const effects of Object.values(s.motion?.events || {}))
          for (const e of effects)
            used.add("effect:" + e.effect + "@" + e.effectVersion);
    }
  const declared = [...m.requirements.required, ...m.requirements.optional];
  if (
    new Set(declared).size !== declared.length ||
    [...used].some((c) => !declared.includes(c)) ||
    declared.some((c) => !used.has(c))
  )
    throw Error("지원 기능 선언과 사용한 기능이 일치하지 않습니다.");
  const supported = [
    ...capabilities,
    ...(doc.theme.customEffects || []).map(
      (definition) => "effect:" + definition.id + "@" + definition.version,
    ),
  ];
  if (m.requirements.required.some((c) => !supported.includes(c)))
    throw Error("필수 지원 기능을 사용할 수 없습니다.");
  for (const [path, hash] of Object.entries(doc.assets)) {
    if (!/\.(png|jpe?g|gif|mp4)$/.test(path))
      throw Error("PNG·JPEG·GIF 이미지와 MP4 영상을 지원합니다.");
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error("자산 해시 오류");
  }
  return true;
}
export class Controller {
  get summary() {
    return this._summary;
  }
  set summary(value) {
    validateCustomEffects(value.effects);
    this._summary = value;
  }
  constructor(appVersion) {
    this.adapter = new CodexAdapter(document, appVersion);
    this.decorations = new Map();
    this.pending = new Map();
    this.next = 0;
    this.lastHeartbeat = Date.now();
    this.summary = { enabled: false, bindings: {}, documents: {}, themes: {} };
    this.preview = null;
    this.assetCache = new Map();
    this.assetPending = new Map();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
  }
  request(op, data = {}) {
    return new Promise((resolve, reject) => {
      const id = String(++this.next);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("연결 요청 시간이 초과되었습니다."));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      window.__coskinRequest(
        JSON.stringify({
          contractVersion: 1,
          sessionId: this.sessionId,
          requestId: id,
          op,
          ...data,
        }),
      );
    });
  }
  response(id, value, error) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (error)
      p.reject(
        Object.assign(
          Error(typeof error === "string" ? error : localizedFailure(error)),
          { code: error.code || "unknown" },
        ),
      );
    else p.resolve(value);
  }
  heartbeat() {
    this.lastHeartbeat = Date.now();
  }
  async start(sessionId) {
    this.sessionId = sessionId;
    this.panel = new Panel(this);
    const syncLocale = () =>
      this.summary.runtimeSettingsAvailable &&
      this.request("runtime-locale", {
        locale: applicationLocale(document, navigator),
      }).catch(() => {});
    this.localeObserver = observeApplicationLocale(document, navigator, () => {
      this.panel.render();
      syncLocale();
    });
    this.summary = await this.request("list");
    await syncLocale();
    if (this.summary.seedVersion !== 3)
      this.summary = await this.request("seed", {
        documents: defaultThemes,
        legacyDocuments: previousDefaultThemes,
      });
    this.panel.render();
    this.events = new AbortController();
    const signal = this.events.signal;
    this.reduced.addEventListener(
      "change",
      () => {
        if (this.motionBlocked) this.stopReplay(false);
        for (const d of this.decorations.values()) {
          d.cancel();
          d.serialized = null;
        }
        this.render(this.targets, true);
        if (!this.panel.host.hidden) this.panel.render();
      },
      { signal },
    );
    for (const name of [
      "pointerover",
      "pointerout",
      "focusin",
      "focusout",
      "pointerdown",
      "pointerup",
    ])
      document.addEventListener(
        name,
        (event) => {
          if (name === "pointerover") this.adapter.pointer(event.target);
          this.renderAffected(event.target);
        },
        {
          signal,
          passive: true,
        },
      );
    document.addEventListener(
      "click",
      (e) => {
        for (const [el, dec] of this.decorations)
          if (el.contains(e.target))
            dec.play(
              dec.final?.motion,
              dec.final?.motion?.trigger === "click" ? "enter" : "click",
              this.motionBlocked,
            );
      },
      { signal, passive: true },
    );
    window.addEventListener("resize", () => this.render(), { signal });
    document.addEventListener(
      "wheel",
      (event) => {
        if (!event.target.closest?.("[data-coskin-ui]")) this.onScroll(event);
      },
      { signal, capture: true, passive: true },
    );
    document.addEventListener("scroll", (event) => this.onScroll(event), {
      signal,
      capture: true,
      passive: true,
    });
    document.addEventListener(
      "visibilitychange",
      () => this.refreshVisibility(),
      {
        signal,
      },
    );
    this.observer = new MutationObserver((records) => {
      if (mutationNeedsDiscovery(records)) this.schedule();
    });
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-selected",
        "aria-current",
        "aria-disabled",
        "disabled",
        "href",
        "data-project-id",
        "data-state",
        "data-app-action-sidebar-thread-id",
        "data-app-action-sidebar-thread-selected",
        "data-app-action-sidebar-thread-active",
        "data-app-action-sidebar-project-id",
      ],
    });
    this.timer = setInterval(() => {
      if (heartbeatExpired(Date.now(), this.lastHeartbeat)) this.dispose();
    }, 5000);
    this.viewportObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const decoration = this.decorations.get(entry.target);
        if (!decoration || decoration.hidden === !entry.isIntersecting)
          continue;
        decoration.hidden = !entry.isIntersecting;
        decoration.setPlaying(decoration.playRequested);
        if (!entry.isIntersecting) decoration.cancel();
        else {
          this.render([decoration.target], true);
          if (!this.scrolling && decoration.activeMotion?.events?.idle?.length)
            decoration.play(
              decoration.activeMotion,
              "idle",
              this.motionBlocked,
            );
        }
      }
    });
    this.resizeObserver = new ResizeObserver((entries) => {
      let mainSurfaceResized = false;
      for (const entry of entries) {
        const decoration = this.decorations.get(entry.target);
        if (decoration?.target.target === "main.surface")
          mainSurfaceResized = true;
        decoration?.position();
      }
      // Codex keeps inactive tab mains mounted at 0×0. A tab switch can
      // change only geometry, so ordinary mutation discovery will not run.
      if (mainSurfaceResized) this.schedule();
    });
    this.render();
    return this.status();
  }
  schedule() {
    if (this.suspended) {
      this.needsRender = true;
      return;
    }
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      if (!this.disposed) this.render();
    });
  }
  profiles(target) {
    if (this.preview)
      return [this.ownedProfile(this.preview.document, this.preview.profile)];
    const context = target.target.startsWith("sidebar.")
      ? target.context
      : this.renderContext || this.adapter.context();
    const profiles = [];
    for (const scope of [
      "global",
      context.project && "project:" + context.project,
      context.thread && "thread:" + context.thread,
    ].filter(Boolean)) {
      const binding = this.summary.bindings[scope],
        doc = this.summary.documents[scope];
      if (binding && doc)
        profiles.push(this.ownedProfile(doc, binding.profile));
    }
    return profiles;
  }
  ownedProfile(doc, id) {
    let cache = this.renderProfileCache?.get(doc);
    if (cache?.has(id)) return cache.get(id);
    const p = doc.theme.profiles.find((p) => p.id === id);
    if (!p) return undefined;
    const result = structuredClone(p);
    result.autoTextColor = !!doc.theme.autoTextColor;
    result.fontFamily = doc.theme.fontFamily;
    result.rules.push(...structuredClone(doc.localOverrides?.[id] || []));
    result.rules = result.rules.filter((rule) =>
      this.adapter.supportedTargets.includes(rule.target),
    );
    for (const rule of result.rules)
      for (const state of Object.values(rule.states))
        if (state.motion?.events)
          for (const event of Object.keys(state.motion.events))
            state.motion.events[event] = state.motion.events[event].filter(
              (effect) =>
                doc.theme.customEffects?.some(
                  (definition) =>
                    definition.id === effect.effect &&
                    definition.version === effect.effectVersion,
                ) ||
                capabilities.includes(
                  "effect:" + effect.effect + "@" + effect.effectVersion,
                ),
            );
    for (const rule of result.rules)
      for (const state of Object.values(rule.states))
        for (const list of Object.values(state.motion?.events || {}))
          for (const effect of list) {
            const definition = doc.theme.customEffects?.find(
              (definition) => definition.id === effect.effect,
            );
            if (definition) effect.customDefinition = definition;
          }
    for (const rule of result.rules)
      for (const state of Object.values(rule.states))
        for (const layer of Object.values(state.style || {}))
          if (layer?.image) layer.image = "sha256:" + doc.assets[layer.image];
    if (this.renderProfileCache) {
      if (!cache) {
        cache = new Map();
        this.renderProfileCache.set(doc, cache);
      }
      cache.set(id, result);
    }
    return result;
  }
  mediaBytes(media) {
    return mediaMemoryBytes(media);
  }
  storeMedia(hash, media) {
    const active = new Set();
    for (const decoration of this.decorations.values())
      for (const player of decoration.players.values())
        active.add(player.media);
    const budget = mediaCacheBudget(media, active);
    let bytes = this.mediaBytes(media);
    for (const cached of this.assetCache.values())
      bytes += this.mediaBytes(cached);
    for (const [key, cached] of this.assetCache) {
      if (bytes <= budget && this.assetCache.size < 64) break;
      if (active.has(cached)) continue;
      this.assetCache.delete(key);
      bytes -= this.mediaBytes(cached);
      disposeMedia(cached);
    }
    if (bytes > budget || this.assetCache.size >= 64) {
      disposeMedia(media);
      throw Error(
        "움직이는 이미지와 이미지의 메모리 예산을 초과했습니다. 이미지 크기나 프레임 수를 줄여 주세요.",
      );
    }
    this.assetCache.set(hash, media);
    return media;
  }
  async loadMedia(hash) {
    const cached = this.assetCache.get(hash);
    if (cached) {
      this.assetCache.delete(hash);
      this.assetCache.set(hash, cached);
      return cached;
    }
    if (this.assetPending.has(hash)) return this.assetPending.get(hash);
    const pending = this.request("asset-read", { hash })
      .then(async (transfer) => {
        const media = await decodeMedia(
          await downloadBytes(this, transfer),
          transfer.mime,
        );
        if (this.disposed) {
          disposeMedia(media);
          throw Error("연결이 종료되었습니다.");
        }
        return this.storeMedia(hash, media);
      })
      .finally(() => this.assetPending.delete(hash));
    this.assetPending.set(hash, pending);
    return pending;
  }
  asset(path) {
    const hash = path.startsWith("sha256:") ? path.slice(7) : null;
    if (!hash) return "";
    const cached = this.assetCache.get(hash);
    if (cached) {
      this.assetCache.delete(hash);
      this.assetCache.set(hash, cached);
      return cached;
    }
    if (!this.assetPending.has(hash))
      this.loadMedia(hash)
        .then(() => {
          const targets = [];
          for (const decoration of this.decorations.values())
            if (decoration.serialized?.includes("sha256:" + hash)) {
              decoration.serialized = null;
              targets.push(decoration.target);
            }
          if (targets.length) this.render(targets, true);
        })
        .catch((error) => this.panel.notify(error.message));
    return "";
  }
  renderAffected(node) {
    if (this.suspended || !this.targets) return;
    const targets = this.targets.filter(
      (t) => node instanceof Node && (t.el === node || t.el.contains(node)),
    );
    if (targets.length) this.render(targets, true);
  }
  get motionBlocked() {
    return isMotionPaused(
      this.summary.motionPolicy,
      this.reduced.matches,
      !!this.nativeMotionPaused,
    );
  }
  pauseMotion(value) {
    if (this.nativeMotionPaused === value) return;
    this.nativeMotionPaused = value;
    if (value) this.stopReplay(false);
    for (const dec of this.decorations.values())
      if (value) {
        if (dec.closing) {
          dec.dispose();
          this.removeDecoration(dec.target.el);
          continue;
        }
        dec.cancel();
        dec.setPlaying(false);
      }
    this.render();
  }
  suspend(value) {
    this.nativeSuspended = value;
    this.refreshVisibility();
  }
  refreshVisibility() {
    const value = !!this.nativeSuspended || document.hidden;
    if (this.suspended === value) return;
    this.suspended = value;
    if (value) this.stopReplay(false);
    if (value) {
      for (const d of this.decorations.values()) {
        if (d.closing) {
          d.dispose();
          this.removeDecoration(d.target.el);
          continue;
        }
        d.setSuspended(true);
        d.cancel();
        d.serialized = null;
      }
    } else {
      for (const d of this.decorations.values()) d.setSuspended(false);
      this.needsRender = false;
      this.render();
    }
  }
  receiveSummary(summary) {
    this.summary = summary;
    this.render();
    if (!this.panel.host.hidden) this.panel.render();
    return this.status();
  }
  refreshDecorations() {
    if (
      this.disposed || this.preview || this.panel?.session?.previewing ||
      this.panel?.dirty || this.panel?.editing || this.panel?.busy ||
      this.externalApplying || this.pending.size
    )
      return false;
    this.stopReplay(false);
    for (const [element, decoration] of [...this.decorations]) {
      decoration.dispose();
      this.removeDecoration(element);
    }
    this.render();
    return true;
  }
  beginExternalUpdate(allowUpdateRequest = false) {
    if (
      this.externalApplying ||
      this.panel.dirty ||
      this.panel.editing ||
      (this.panel.busy &&
        !(allowUpdateRequest && this.panel.updateRequesting)) ||
      (allowUpdateRequest && this.panel.runtimeSettingsDraft) ||
      this.panel.session.previewing
    )
      return false;
    this.externalApplying = true;
    return true;
  }
  endExternalUpdate() {
    this.externalApplying = false;
  }
  trayBusyMessage() {
    return t("control.runtimeTrayBusy");
  }
  receiveRuntimeSettings(settings) {
    this.panel.runtimeSettings = settings;
    if (this.panel.settingsOpen) this.panel.render();
  }
  openLibrary() {
    if (!document.querySelector('nav[data-app-navigation-rail="true"]'))
      return false;
    if (this.panel.editing || this.panel.dirty || this.panel.session.previewing)
      return false;
    this.panel.settingsOpen = false;
    this.panel.openPage();
    return true;
  }
  async persistDraftForExit() {
    await this.panel.stopDraft();
    if (this.panel.dirty && this.panel.doc)
      await this.request("draft", {
        id: this.panel.selected,
        baseRevision: this.panel.baseRevision,
        document: structuredClone(this.panel.doc),
      });
    return true;
  }
  async openSettings() {
    if (!document.querySelector('nav[data-app-navigation-rail="true"]'))
      return false;
    if (this.panel.editing || this.panel.dirty || this.panel.session.previewing)
      return false;
    this.panel.runtimeSettings = await this.request("runtime-settings-read");
    this.panel.runtimeSettingsDraft = null;
    this.panel.settingsOpen = true;
    this.panel.openPage();
    return true;
  }
  async prepare(summary) {
    const verifiedHashes = new Set();
    let decodedBytes = 0;
    for (const doc of Object.values(summary.documents)) {
      await validateDocument(doc);
      for (const capability of doc.manifest.requirements.required)
        if (
          capability.startsWith("target:") &&
          !this.adapter.supportedTargets.includes(capability.slice(7))
        )
          throw Error("지원하지 않는 꾸미기 대상이 필요합니다.");
      for (const hash of Object.values(doc.assets)) {
        if (verifiedHashes.has(hash)) continue;
        verifiedHashes.add(hash);
        const media = await this.loadMedia(hash);
        decodedBytes += this.mediaBytes(media);
        if (decodedBytes > 128 * 1024 * 1024)
          throw Error(
            "테마 전체 이미지의 메모리 예산을 초과했습니다. 이미지 크기나 프레임 수를 줄여 주세요.",
          );
      }
    }
    return true;
  }
  releaseUnusedMedia() {
    const active = new Set();
    for (const decoration of this.decorations.values())
      for (const player of decoration.players.values())
        active.add(player.media);
    let unusedBytes = 0;
    for (const cached of this.assetCache.values())
      if (!active.has(cached)) unusedBytes += this.mediaBytes(cached);
    for (const [hash, media] of this.assetCache) {
      if (unusedBytes <= 8 * 1024 * 1024) break;
      if (active.has(media)) continue;
      this.assetCache.delete(hash);
      unusedBytes -= this.mediaBytes(media);
      disposeMedia(media);
    }
  }
  render(subset = null, partial = false) {
    if (this.scrolling) {
      this.scrollRenderPending = true;
      return;
    }
    if (this.disposed) return;
    if (this.suspended) {
      this.needsRender = true;
      return;
    }
    this.renderProfileCache = new WeakMap();
    this.renderContext = this.adapter.context();
    const targets = subset || this.adapter.discover();
    if (!partial) this.targets = targets;
    const live = new Set();
    if (this.summary.enabled || this.preview) {
      for (const t of targets) {
        live.add(t.el);
        let dec = this.decorations.get(t.el);
        if (
          dec &&
          (dec.target.item !== t.item || dec.target.target !== t.target)
        ) {
          dec.dispose();
          this.removeDecoration(t.el);
          dec = null;
        }
        const profiles = this.profiles(t);
        const final = resolve(
          profiles,
          t.target,
          t.item,
          this.replay?.element === t.el
            ? this.replay.flags
            : this.adapter.state(t.el),
        );
        applyThemeTypography(
          final,
          profiles,
          (image) => this.asset(image),
          t.target,
        );
        const nativeEffects = Object.values(final.motion?.events || {})
          .flat()
          .some(
            (effect) =>
              effect.layer === "text" ||
              (effect.layer === "icon" &&
                t.el.querySelectorAll("svg").length === 1),
          );
        if (
          (!final.style || !Object.values(final.style).some(Boolean)) &&
          !nativeEffects
        ) {
          if (dec) {
            if (
              !dec.closing &&
              !this.scrolling &&
              !this.motionBlocked &&
              !this.suspended &&
              dec.activeMotion?.events?.exit?.length &&
              !dec.hidden
            ) {
              dec.closing = true;
              const duration = dec.transition(
                {},
                { mode: "none" },
                dec.activeMotion,
                false,
              );
              dec.final = final;
              dec.activeMotion = { mode: "none" };
              dec.closingTimer = setTimeout(() => {
                if (dec.closing && this.decorations.get(t.el) === dec) {
                  dec.dispose();
                  this.removeDecoration(t.el);
                }
              }, duration);
            } else if (
              !dec.closing ||
              this.motionBlocked ||
              this.suspended ||
              dec.hidden
            ) {
              dec.dispose();
              this.removeDecoration(t.el);
            }
          }
          continue;
        }
        if (!dec) {
          dec = new Decoration(t, (p) => this.asset(p));
          this.decorations.set(t.el, dec);
          this.viewportObserver?.observe(t.el);
          this.resizeObserver?.observe(t.el);
        }
        if (dec.closing) {
          clearTimeout(dec.closingTimer);
          dec.closing = false;
          dec.serialized = null;
        }
        const flags =
          this.replay?.element === t.el
            ? this.replay.flags
            : this.adapter.state(t.el);
        const trigger = final.motion?.trigger;
        const active =
          !trigger ||
          trigger === "always" ||
          this.replay?.element === t.el ||
          (trigger !== "click" && flags[trigger]);
        const activeMotion = active ? final.motion : { mode: "none" };
        const serialized = JSON.stringify([
          final,
          this.motionBlocked,
          !!active,
        ]);
        if (dec.serialized !== serialized) {
          const previous = dec.activeMotion;
          dec.transition(
            final.style,
            activeMotion,
            previous,
            this.motionBlocked || !!this.scrolling,
          );
          dec.final = final;
          dec.activeMotion = activeMotion;
          dec.serialized = serialized;
        }
        if (!partial && t.paintSources) dec.position();
        dec.setScrollPaused(!!this.scrolling);
        dec.setPlaying(
          !this.suspended &&
            !this.motionBlocked &&
            !this.adapter.state(t.el).disabled,
        );
        if (document.hidden || dec.hidden || this.motionBlocked) {
          dec.cancel();
        }
      }
    }
    for (const [el, dec] of this.decorations)
      if ((!partial && !live.has(el)) || !el.isConnected) {
        dec.dispose();
        this.removeDecoration(el);
      }
    this.releaseUnusedMedia();
    this.panel.ensureEntry();
  }
  removeDecoration(element) {
    this.viewportObserver?.unobserve(element);
    this.resizeObserver?.unobserve(element);
    this.decorations.delete(element);
  }
  position() {
    const changed = [];
    for (const dec of this.decorations.values())
      if (dec.position()) {
        dec.serialized = null;
        changed.push(dec.target);
      }
    if (changed.length) this.render(changed, true);
  }
  onScroll(event) {
    if (!this.scrolling) {
      this.scrolling = true;
      if (this.replay) {
        clearTimeout(this.replayTimer);
        this.replayRemaining = Math.max(
          0,
          (this.replayDeadline || performance.now()) - performance.now(),
        );
      }
      for (const decoration of this.decorations.values())
        decoration.setScrollPaused(true, false);
    }
    const sidebar = sidebarForScroll(event?.target);
    if (sidebar)
      for (const decoration of this.decorations.values())
        if (pauseMediaForSidebarScroll(decoration.target, sidebar))
          decoration.setScrollPaused(true, true);
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.scrolling = false;
      for (const decoration of this.decorations.values())
        decoration.setScrollPaused(false);
      if (this.scrollRenderPending) {
        this.scrollRenderPending = false;
        this.render();
      }
      if (this.replay) this.armReplay(this.replayRemaining);
    }, 140);
  }
  async update(op, data) {
    const result = await this.request(op, data);
    this.summary = await this.request("list");
    this.render();
    return result;
  }
  status() {
    return {
      adapter: this.adapter.version,
      targets: (this.targets || []).map((t) => ({
        target: t.target,
        item: t.item,
        context: t.context,
      })),
      entry: !!this.panel?.entry.isConnected,
      enabled: this.summary.enabled,
      decorations: this.decorations.size,
    };
  }
  replayTarget(target, item, state) {
    this.stopReplay();
    if (this.motionBlocked || this.suspended) return;
    const match = this.targets?.find(
      (candidate) =>
        candidate.target === target && (!item || candidate.item === item),
    );
    if (!match) return;
    const flags =
      state === "base"
        ? {}
        : state === "selectedHover"
          ? { selected: true, hover: true }
          : { [state]: true };
    this.replay = { element: match.el, flags };
    this.render([match], true);
    const decoration = this.decorations.get(match.el);
    decoration?.play(decoration.final?.motion, "enter", false);
    this.armReplay(playbackBudget(decoration?.final?.motion) + 80);
  }
  armReplay(milliseconds) {
    this.replayRemaining = milliseconds;
    clearTimeout(this.replayTimer);
    if (this.scrolling) return;
    this.replayDeadline = performance.now() + milliseconds;
    this.replayTimer = setTimeout(() => this.stopReplay(), milliseconds);
  }
  stopReplay(render = true) {
    clearTimeout(this.replayTimer);
    this.replayRemaining = 0;
    this.replayDeadline = 0;
    const element = this.replay?.element;
    const decoration = this.decorations.get(element);
    decoration?.cancel();
    this.replay = null;
    const target = this.targets?.find((target) => target.el === element);
    if (render && target?.el.isConnected) this.render([target], true);
    if (render) {
      const restored = this.decorations.get(element);
      restored?.cancel();
      if (restored?.closing) {
        restored.dispose();
        this.removeDecoration(element);
      } else if (restored?.activeMotion?.events?.idle?.length) {
        restored.play(restored.activeMotion, "idle", this.motionBlocked);
      }
    }
    if (render && this.panel?.editing && !this.panel.host.hidden)
      this.panel.render();
  }
  dispose() {
    this.stopReplay(false);
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    clearTimeout(this.scrollTimer);
    this.viewportObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.events?.abort();
    this.observer?.disconnect();
    this.localeObserver?.dispose();
    for (const dec of this.decorations.values()) dec.dispose();
    this.decorations.clear();
    this.panel?.dispose();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("연결이 종료되었습니다."));
    }
    this.pending.clear();
    for (const media of this.assetCache.values()) disposeMedia(media);
    this.assetCache.clear();
    delete window.__coskin;
  }
}
