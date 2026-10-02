(() => {
  if (globalThis.__coskinRendererBridge?.contractVersion === 1)
    return true;
  const load = process.getBuiltinModule("module").createRequire(
    process.resourcesPath + "/app.asar/package.json",
  );
  const { webContents, BrowserWindow, app } = load("electron");
  const sessions = new Map();
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
    contractVersion: 1,
    metrics() {
      return (app?.getAppMetrics() ?? []).map(({pid, type, cpu, memory}) => ({pid, type, cpu, memory}));
    },
    async capture(id) {
      return (await page(id).capturePage()).toPNG().toString("base64");
    },
    list() {
      heartbeat = Date.now();
      return webContents.getAllWebContents().filter(contents => {
        try { return page(contents.id) === contents; } catch { return false; }
      }).map(contents => {
        const window = BrowserWindow.fromWebContents(contents);
        return {id: String(contents.id), type: "page", url: contents.getURL(), nativeWindow: window?.getNativeWindowHandle().readBigUInt64LE().toString(16) ?? null};
      });
    },
    async command(id, method, parameters) {
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
      for (const id of Array.from(sessions.keys())) {
        try { this.detach(id); } catch {}
      }
      delete globalThis.__coskinRendererBridge;
    },
  };
  return true;
})()
