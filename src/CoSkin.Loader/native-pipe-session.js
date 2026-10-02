(input, output, installBridge) => {
  const fs = process.getBuiltinModule("fs");
  const net = process.getBuiltinModule("net");
  const http = process.getBuiltinModule("http");
  const crypto = process.getBuiltinModule("crypto");
  const path = process.getBuiltinModule("path");
  if (fs.statSync(input).size > 4096)
    throw Error("Invalid CoSkin connection request");
  const request = JSON.parse(fs.readFileSync(input, "utf8"));
  if (request.contractVersion !== 2 || request.pid !== process.pid ||
      !Number.isSafeInteger(request.ownerPid) || request.ownerPid <= 0 ||
      !Number.isSafeInteger(request.created) ||
      !/^[a-f0-9]{64}$/.test(request.nonce) ||
      typeof request.pipeName !== "string" ||
      !new RegExp("^CoSkin-" + process.pid + "-[a-f0-9]{32}$").test(request.pipeName) ||
      Math.abs(Date.now() - request.created) > 30000)
    throw Error("Expired CoSkin connection request");
  const respond = (result) => {
    const temporary = output + "." + request.nonce + ".tmp";
    try {
      fs.writeFileSync(temporary, JSON.stringify({
        contractVersion: 2, pid: process.pid, nonce: request.nonce, ...result,
      }), {flag: "wx", mode: 0o600});
      fs.renameSync(temporary, output);
      return true;
    } catch { return false; }
  };
  const previous = globalThis.__coskinNativeEndpoint;
  if (previous?.contractVersion === 2 && previous.nonce === request.nonce) {
    if (previous.ready) respond({url: previous.url, pipeName: previous.pipeName});
    return true;
  }
  if (previous) {
    let alive = false;
    try { process.kill(previous.ownerPid, 0); alive = true; } catch {}
    if (alive && (previous.ownerPid !== request.ownerPid || previous.client)) {
      respond({error: "Another CoSkin session owns this Codex connection"});
      return true;
    }
    previous.dispose?.();
    globalThis.__coskinRendererBridge?.dispose();
  }
  const limit = 8 * 1024 * 1024;
  // The public discovery name must not reveal the authentication secret.
  const pipeName = request.pipeName;
  const pipePath = "\\\\.\\pipe\\" + pipeName;
  const clients = new Set();
  const registrations = new Map();
  const mediaStreams = new Set();
  const httpSockets = new Set();
  const mediaTypes = new Set(["video/webm", "video/mp4", "image/gif", "image/png", "image/jpeg"]);
  const maximumMediaBytes = 512 * 1024 * 1024;
  let registering = 0;
  let closed = false;
  let heartbeat = Date.now();
  let lease;
  const endpoint = globalThis.__coskinNativeEndpoint = {
    contractVersion: 2, ownerPid: request.ownerPid, pid: process.pid,
    nonce: request.nonce, pipeName, ready: false, client: null,
    dispose() {
      if (closed) return;
      closed = true;
      clearInterval(lease);
      registrations.clear();
      for (const stream of mediaStreams) {
        stream.cancelled = true;
        stream.source?.destroy();
        stream.response.destroy();
      }
      for (const socket of httpSockets) socket.destroy();
      globalThis.__coskinRendererBridge?.dispose();
      delete globalThis.__coskinRendererEvent;
      for (const client of clients) client.destroy();
      if (pipe.listening) pipe.close();
      if (metadata.listening) metadata.close();
      if (globalThis.__coskinNativeEndpoint === endpoint)
        delete globalThis.__coskinNativeEndpoint;
    },
  };
  const write = (client, value) => {
    if (client.destroyed || closed) return;
    const data = Buffer.from(JSON.stringify(value), "utf8");
    if (data.length > limit || client.writableLength > limit * 2) {
      client.destroy();
      return;
    }
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(data.length);
    client.cork();
    client.write(header);
    client.write(data);
    client.uncork();
  };
  const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
  const openMedia = async (filePath) => {
    const stat = await fs.promises.lstat(filePath, {bigint: true});
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Media must be a regular file without symlinks");
    const actualPath = await fs.promises.realpath(filePath);
    const normalize = (value) => process.platform === "win32" ? path.normalize(value).toLowerCase() : path.normalize(value);
    if (normalize(actualPath) !== normalize(filePath)) throw Error("Media symlink paths are not supported");
    const file = await fs.promises.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = await file.stat({bigint: true});
      if (!opened.isFile() || !sameFile(stat, opened)) throw Error("Media file changed while opening");
      return {file, stat: opened};
    } catch (error) { await file.close(); throw error; }
  };
  const registerMedia = async (parameters) => {
    // The authenticated Loader verifies the asset SHA. Recheck its file identity
    // for every HTTP read without loading the whole asset into the main heap.
    if (Object.keys(parameters).some((key) => !["path", "mime", "length", "hash"].includes(key)) ||
        typeof parameters.path !== "string" || parameters.path.length > 32767 || parameters.path.includes("\0") ||
        !path.isAbsolute(parameters.path) || !mediaTypes.has(parameters.mime) ||
        !Number.isSafeInteger(parameters.length) || parameters.length < 1 || parameters.length > maximumMediaBytes ||
        typeof parameters.hash !== "string" || !/^[a-f0-9]{64}$/.test(parameters.hash))
      throw Error("Invalid CoSkin media registration");
    if (closed || !endpoint.ready || registrations.size + registering >= 64)
      throw Error("CoSkin media registration limit");
    registering++;
    let opened;
    try {
      const filePath = path.normalize(parameters.path);
      opened = await openMedia(filePath);
      if (Number(opened.stat.size) !== parameters.length) throw Error("CoSkin media length mismatch");
      if (closed) throw Error("CoSkin session closed");
      let token;
      do { token = crypto.randomBytes(32).toString("hex"); } while (registrations.has(token));
      registrations.set(token, {path: filePath, mime: parameters.mime, length: parameters.length,
        hash: parameters.hash, stat: opened.stat, streams: new Set()});
      return {available: true, url: endpoint.url + "/media/" + token,
        mime: parameters.mime, length: parameters.length, token};
    } finally { registering--; await opened?.file.close(); }
  };
  const releaseMedia = (parameters) => {
    if (Object.keys(parameters).some((key) => key !== "token") ||
        typeof parameters.token !== "string" || !/^[a-f0-9]{64}$/.test(parameters.token))
      throw Error("Invalid CoSkin media release");
    const registration = registrations.get(parameters.token);
    registrations.delete(parameters.token);
    for (const stream of registration?.streams || []) {
      stream.cancelled = true;
      stream.source?.destroy();
      stream.response.destroy();
    }
    return {ok: true};
  };
  const mediaRange = (header, length) => {
    if (header === undefined) return {start: 0, end: length - 1, partial: false};
    if (typeof header !== "string") return null;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
      return {start: Math.max(0, length - suffix), end: length - 1, partial: true};
    }
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || end < start) return null;
    return {start, end: Math.min(end, length - 1), partial: true};
  };
  const serveMedia = async (incoming, response, registration) => {
    const range = mediaRange(incoming.headers.range, registration.length);
    if (!range) {
      response.setHeader("Content-Range", "bytes */" + registration.length);
      response.writeHead(416); response.end(); return;
    }
    if (mediaStreams.size >= 32) { response.writeHead(503); response.end(); return; }
    const stream = {response, registration, source: null, cancelled: false};
    mediaStreams.add(stream);
    registration.streams.add(stream);
    const remove = () => { mediaStreams.delete(stream); registration.streams.delete(stream); };
    response.once("close", () => {
      stream.cancelled = true;
      stream.source?.destroy();
      if (stream.source) remove();
    });
    let opened, handedOff = false;
    try {
      opened = await openMedia(registration.path);
      if (!sameFile(registration.stat, opened.stat)) throw Error("Registered media file changed");
      if (closed || stream.cancelled || !registrationsHas(registration)) return;
      response.setHeader("Content-Type", registration.mime);
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Content-Length", range.end - range.start + 1);
      if (range.partial) response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${registration.length}`);
      response.writeHead(range.partial ? 206 : 200);
      if (incoming.method === "HEAD") { response.end(); return; }
      const source = opened.file.createReadStream({start: range.start, end: range.end, highWaterMark: 64 * 1024, autoClose: true});
      stream.source = source;
      handedOff = true;
      source.once("close", remove);
      source.once("error", () => response.destroy());
      source.pipe(response);
    } catch {
      if (!response.destroyed) {
        if (response.headersSent) response.destroy();
        else { response.writeHead(404); response.end(); }
      }
    } finally {
      if (!handedOff) { await opened?.file.close(); remove(); }
    }
  };
  const registrationsHas = (registration) => [...registrations.values()].includes(registration);
  const pipe = net.createServer((client) => {
    if (closed || endpoint.client || clients.size >= 4) {
      client.destroy();
      return;
    }
    clients.add(client);
    client.unref();
    let authenticated = false;
    let inFlight = 0;
    let header = Buffer.alloc(4), headerUsed = 0;
    let body = null, bodyUsed = 0;
    const authDeadline = setTimeout(() => client.destroy(), 3000);
    authDeadline.unref();
    const dispatch = async (message) => {
      if (!Number.isSafeInteger(message?.id) || message.id <= 0 ||
          typeof message.method !== "string" || ++inFlight > 32) {
        client.destroy();
        return;
      }
      try {
        const parameters = message.params;
        if (!parameters || typeof parameters !== "object" || Array.isArray(parameters))
          throw Error("Invalid CoSkin request");
        let result;
        if (!authenticated) {
          const nonce = parameters.nonce;
          if (message.method !== "CoSkin.authenticate" ||
              parameters.ownerPid !== endpoint.ownerPid ||
              typeof nonce !== "string" || !/^[a-f0-9]{64}$/.test(nonce) ||
              !crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(endpoint.nonce)) ||
              endpoint.client)
            throw Error("CoSkin connection authentication failed");
          authenticated = true;
          endpoint.client = client;
          clearTimeout(authDeadline);
          result = {contractVersion: 2, pid: process.pid, ownerPid: endpoint.ownerPid};
        } else {
          const bridge = globalThis.__coskinRendererBridge;
          switch (message.method) {
            case "CoSkin.list": result = {targets: bridge.list()}; break;
            case "CoSkin.command":
              if (!Number.isSafeInteger(parameters.rendererId) || parameters.rendererId <= 0)
                throw Error("Invalid CoSkin window");
              result = await bridge.command(parameters.rendererId, parameters.method, parameters.parameters);
              break;
            case "CoSkin.detach": bridge.detach(parameters.rendererId); result = {}; break;
            case "CoSkin.runtimeInfo":
              result = {pid: process.pid, versions: process.versions, memory: process.memoryUsage(), metrics: bridge.metrics?.() ?? []};
              break;
            case "CoSkin.capture":
              if (!Number.isSafeInteger(parameters.rendererId) || parameters.rendererId <= 0)
                throw Error("Invalid CoSkin window");
              result = {png: await bridge.capture(parameters.rendererId)};
              break;
            case "CoSkin.media.register": result = await registerMedia(parameters); break;
            case "CoSkin.media.release": result = releaseMedia(parameters); break;
            case "CoSkin.dispose":
              write(client, {id: message.id, result: {}});
              // Drain the acknowledgement, then detach only this session's debugger.
              client.end(() => endpoint.dispose());
              return;
            default: throw Error("Unsupported CoSkin pipe command");
          }
        }
        heartbeat = Date.now();
        write(client, {id: message.id, result: result ?? {}});
      } catch (error) {
        write(client, {id: message.id, error: {message: String(error.message).slice(0, 500)}});
        if (!authenticated) client.end();
      } finally { inFlight--; }
    };
    client.on("data", (chunk) => {
      try {
        let offset = 0;
        while (offset < chunk.length && !client.destroyed) {
          if (!body) {
            const count = Math.min(4 - headerUsed, chunk.length - offset);
            chunk.copy(header, headerUsed, offset, offset + count);
            offset += count;
            headerUsed += count;
            if (headerUsed < 4) continue;
            const length = header.readUInt32LE();
            if (length < 2 || length > (authenticated ? limit : 4096))
              throw Error("CoSkin pipe message size");
            body = Buffer.allocUnsafe(length);
            bodyUsed = 0;
          }
          const count = Math.min(body.length - bodyUsed, chunk.length - offset);
          chunk.copy(body, bodyUsed, offset, offset + count);
          offset += count;
          bodyUsed += count;
          if (bodyUsed === body.length) {
            const message = JSON.parse(body.toString("utf8"));
            body = null; headerUsed = 0;
            // A renderer evaluation can await a binding reply. Keep reading replies
            // instead of serializing awaited commands and deadlocking that renderer.
            void dispatch(message);
          }
        }
      } catch { client.destroy(); }
    });
    client.on("error", () => {});
    client.on("close", () => {
      clearTimeout(authDeadline);
      clients.delete(client);
      body = null;
      if (endpoint.client === client) endpoint.dispose();
    });
  });
  const metadata = http.createServer((incoming, response) => {
    response.setHeader("Connection", "close");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const token = /^\/media\/([a-f0-9]{64})$/.exec(incoming.url || "")?.[1];
    if (token) {
      const origin = incoming.headers.origin;
      if (origin !== undefined && !["app://-", "null"].includes(origin)) {
        response.writeHead(403); response.end(); return;
      }
      response.setHeader("Access-Control-Allow-Origin", origin === "null" ? "null" : "app://-");
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type");
      if (incoming.method === "OPTIONS" && ["app://-", "null"].includes(origin) &&
          ["GET", "HEAD"].includes(incoming.headers["access-control-request-method"]) &&
          (!incoming.headers["access-control-request-headers"] || incoming.headers["access-control-request-headers"].toLowerCase() === "range")) {
        response.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
        response.setHeader("Access-Control-Allow-Headers", "Range");
        response.writeHead(204); response.end(); return;
      }
      const registration = registrations.get(token);
      if (closed || !registration || !["GET", "HEAD"].includes(incoming.method)) {
        response.writeHead(404); response.end(); return;
      }
      void serveMedia(incoming, response, registration).catch(() => response.destroy());
      return;
    }
    if (closed || incoming.method !== "GET" || incoming.url !== "/json/list") {
      response.writeHead(404); response.end(); return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify([{type: "coskin-native", contractVersion: 2,
      pid: process.pid, pipeName}]));
  });
  metadata.headersTimeout = 3000;
  metadata.requestTimeout = 3000;
  metadata.maxConnections = 64;
  metadata.maxHeadersCount = 20;
  metadata.on("connection", (socket) => {
    httpSockets.add(socket);
    socket.unref();
    socket.once("close", () => httpSockets.delete(socket));
  });
  const fail = (error) => {
    if (closed) return;
    respond({error: String(error.message).slice(0, 200)});
    endpoint.dispose();
  };
  pipe.on("error", fail);
  metadata.on("error", fail);
  try {
    if (installBridge() !== true) throw Error("CoSkin window bridge unavailable");
    globalThis.__coskinRendererEvent = (payload) => {
      if (endpoint.client) write(endpoint.client, {method: "Runtime.bindingCalled",
        params: {name: "__coskinRendererEvent", payload}});
    };
    lease = setInterval(() => {
      if (Date.now() - heartbeat > 90000) endpoint.dispose();
    }, 15000);
    lease.unref();
    pipe.listen(pipePath, () => {
      if (closed) { pipe.close(); return; }
      pipe.unref();
      metadata.listen(0, "127.0.0.1", () => {
        if (closed) { metadata.close(); return; }
        metadata.unref();
        endpoint.url = "http://127.0.0.1:" + metadata.address().port;
        endpoint.ready = true;
        if (!respond({url: endpoint.url, pipeName})) endpoint.dispose();
      });
    });
  } catch (error) { fail(error); }
  return true;
}
