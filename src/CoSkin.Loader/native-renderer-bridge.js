(() => {
  if (globalThis.__coskinRendererBridge?.contractVersion === 2)
    return true;
  globalThis.__coskinRendererBridge?.dispose();
  const load = process.getBuiltinModule("module").createRequire(
    process.resourcesPath + "/app.asar/package.json",
  );
  const { webContents, BrowserWindow, app } = load("electron");
  const sessions = new Map();
  const backgroundViews = new Map();
  const page = (id) => {
    const contents = webContents.fromId(id);
    if (!contents || contents.isDestroyed() || contents.getType() !== "window")
      throw Error("The Codex window is unavailable");
    const url = new URL(contents.getURL());
    if (url.protocol !== "app:" || url.host !== "-" || url.hash ||
        !(url.pathname === "/index.html" && !url.search || url.pathname === "/detached-window.html" && url.search === "?initialRoute=%2Fdetached-window"))
      throw Error("The window is outside the Codex interface");
    return contents;
  };
  const restoreBackgroundView = (id) => {
    const state = backgroundViews.get(id);
    if (!state) return 0;
    backgroundViews.delete(id);
    for (const undo of state.undo.reverse()) {
      try { undo(); } catch {}
    }
    for (const [view, record] of state.views) {
      try {
        if (!view.webContents.isDestroyed()) record.setVisible.call(view, record.visible);
      } catch {}
    }
    try {
      if (state.focused && !state.focused.isDestroyed() && state.window.isFocused() &&
          state.contents.isFocused() && [...state.views].some(([view, record]) => view.webContents === state.focused && record.visible))
        state.focused.focus();
    } catch {}
    return state.views.size;
  };
  const setBackgroundView = (id, active) => {
    const contents = page(id);
    if (typeof active !== "boolean") throw Error("Invalid background-only visibility");
    if (!active) return {supported: true, hidden: false, views: restoreBackgroundView(id)};
    const window = BrowserWindow.fromWebContents(contents), root = window?.contentView;
    if (!root) return {supported: false, hidden: false, views: 0};
    let state = backgroundViews.get(id);
    if (!state) {
      state = {contents, window, views: new Map(), parents: new Set(), undo: []};
      backgroundViews.set(id, state);
    }
    const replace = (owner, name, replacement) => {
      const previous = Object.getOwnPropertyDescriptor(owner, name);
      owner[name] = replacement;
      state.undo.push(() => {
        if (owner[name] !== replacement) return;
        if (previous) Object.defineProperty(owner, name, previous);
        else delete owner[name];
      });
    };
    const cover = (view) => {
      // BrowserWindow's own shell stays visible so its background and titlebar
      // remain usable. Only this window's embedded native content is hidden.
      if (view.webContents && view.webContents !== contents && !view.webContents.isDestroyed() &&
          typeof view.setVisible === "function" && typeof view.getVisible === "function") {
        let record = state.views.get(view);
        if (!record) {
          record = {visible: view.getVisible(), setVisible: view.setVisible};
          state.views.set(view, record);
          if (view.webContents.isFocused?.()) state.focused = view.webContents;
          replace(view, "setVisible", function (visible) {
            record.visible = visible;
            return record.setVisible.call(this, false);
          });
        }
        record.setVisible.call(view, false);
      }
      if (!state.parents.has(view) && typeof view.addChildView === "function") {
        state.parents.add(view);
        const add = view.addChildView;
        replace(view, "addChildView", function (child, ...args) {
          const result = add.call(this, child, ...args);
          cover(child);
          return result;
        });
      }
      for (const child of view.children || []) cover(child);
    };
    try {
      cover(root);
      if (state.focused?.isFocused?.()) contents.focus();
      return {supported: true, hidden: true, views: state.views.size};
    } catch (error) {
      restoreBackgroundView(id);
      throw error;
    }
  };
  const commands = new Set([
    "Runtime.enable", "Runtime.addBinding", "Runtime.evaluate", "Runtime.callFunctionOn",
    "Runtime.removeBinding", "Page.bringToFront",
  ]);
  let heartbeat = Date.now();
  const lease = setInterval(() => {
    if (Date.now() - heartbeat > 90000) globalThis.__coskinRendererBridge?.dispose();
  }, 15000);
  lease.unref();
  globalThis.__coskinRendererBridge = {
    contractVersion: 2,
    metrics() {
      return (app?.getAppMetrics() ?? []).map(({pid, type, cpu, memory}) => ({pid, type, cpu, memory}));
    },
    async capture(id) {
      return (await page(id).capturePage()).toPNG().toString("base64");
    },
    list() {
      heartbeat = Date.now();
      for (const id of backgroundViews.keys()) {
        try { setBackgroundView(id, true); } catch { restoreBackgroundView(id); }
      }
      return webContents.getAllWebContents().filter(contents => {
        try { return page(contents.id) === contents; } catch { return false; }
      }).map(contents => {
        const window = BrowserWindow.fromWebContents(contents);
        return {id: String(contents.id), type: "page", url: contents.getURL(), nativeWindow: window?.getNativeWindowHandle().readBigUInt64LE().toString(16) ?? null};
      });
    },
    async command(id, method, parameters) {
      if (method === "CoSkin.backgroundView") return setBackgroundView(id, parameters?.active);
      if (!commands.has(method)) throw Error("Unsupported CoSkin debugger command");
      const contents = page(id);
      if (method === "Page.bringToFront") {
        const window = BrowserWindow.fromWebContents(contents);
        if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
        return {};
      }
      if (!sessions.has(id)) {
        if (contents.debugger.isAttached())
          throw Error("Another debugger is using the Codex window");
        contents.debugger.attach("1.3");
        const listener = (_, event, data) => {
          if (event === "Runtime.bindingCalled" && data.name === "__coskinRequest")
            globalThis.__coskinRendererEvent?.(JSON.stringify({id, method:event, params:data}));
        };
        const detached = () => { sessions.delete(id); contents.debugger.removeListener("message", listener); };
        contents.debugger.on("message", listener);
        contents.debugger.once("detach", detached);
        sessions.set(id, {contents, listener, detached});
      }
      return await contents.debugger.sendCommand(method, parameters);
    },
    detach(id) {
      restoreBackgroundView(id);
      const session = sessions.get(id);
      if (!session) return;
      sessions.delete(id);
      session.contents.debugger.removeListener("message", session.listener);
      session.contents.debugger.removeListener("detach", session.detached);
      if (!session.contents.isDestroyed() && session.contents.debugger.isAttached())
        session.contents.debugger.detach();
    },
    dispose() {
      clearInterval(lease);
      for (const id of backgroundViews.keys()) restoreBackgroundView(id);
      for (const id of Array.from(sessions.keys())) {
        try { this.detach(id); } catch {}
      }
      delete globalThis.__coskinRendererBridge;
    },
  };
  return true;
})()
