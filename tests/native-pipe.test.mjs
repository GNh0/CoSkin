import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

async function fixture(t, delayOpen = 0) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coskin-pipe-test-'));
  const nonce = crypto.randomBytes(32).toString('hex');
  const output = path.join(directory, 'response.json');
  const child = spawn(process.execPath, [fileURLToPath(new URL('helpers/native-pipe-child.cjs', import.meta.url)),
    fileURLToPath(new URL('../src/CoSkin.Loader/native-pipe-session.js', import.meta.url)),
    path.join(directory, 'request.json'), output, nonce, String(process.pid), crypto.randomBytes(16).toString('hex'), String(delayOpen)],
  {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  let socket;
  t.after(async () => {
    socket?.destroy();
    if (child.exitCode === null) {
      const ended = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await ended;
    }
    await fs.rm(directory, {recursive: true, force: true});
  });
  let ready;
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    try { ready = JSON.parse(await fs.readFile(output, 'utf8')); break; } catch {}
    if (child.exitCode !== null) throw Error(errors || 'Owned fixture exited');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(ready, errors);
  assert.equal(ready.error, undefined);
  socket = net.connect('\\\\.\\pipe\\' + ready.pipeName);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  let buffer = Buffer.alloc(0), next = 1;
  const pending = new Map(), events = [];
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE() + 4) {
      const length = buffer.readUInt32LE();
      const value = JSON.parse(buffer.subarray(4, length + 4).toString());
      buffer = buffer.subarray(length + 4);
      if (value.id) { pending.get(value.id)?.resolve(value); pending.delete(value.id); }
      else events.push(value);
    }
  });
  socket.on('close', () => {
    for (const request of pending.values()) request.reject(Error('Owned pipe disconnected'));
    pending.clear();
  });
  const send = async (method, params = {}, split = false) => {
    const id = next++;
    const data = Buffer.from(JSON.stringify({id, method, params}));
    const header = Buffer.alloc(4); header.writeUInt32LE(data.length);
    const frame = Buffer.concat([header, data]);
    let timer;
    const response = new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      timer = setTimeout(() => { pending.delete(id); reject(Error('Pipe request timed out')); }, 5000);
    }).finally(() => clearTimeout(timer));
    if (split) {
      // The exact division that crashed the disposable Node inspector.
      socket.write(frame.subarray(0, -10));
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(child.exitCode, null);
      socket.write(frame.subarray(-10));
    } else socket.write(frame);
    return response;
  };
  const auth = (secret = nonce) => send('CoSkin.authenticate', {nonce: secret, ownerPid: process.pid});
  return {child, socket, ready, nonce, send, auth, events, directory};
}

async function mediaFile(f, name = 'sample.webm') {
  const bytes = Buffer.from(Array.from({length: 300001}, (_, index) => (index * 31) & 255));
  const file = path.join(f.directory, name);
  await fs.writeFile(file, bytes);
  return {bytes, parameters: {path: file, mime: 'video/webm', length: bytes.length,
    hash: crypto.createHash('sha256').update(bytes).digest('hex')}};
}
async function pausedMedia(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.pause();
      response.on('error', () => {});
      const closed = new Promise(done => response.once('close', done));
      resolve({request, response, closed});
    });
    request.on('error', reject);
  });
}
async function waitForFile(file, expected) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    try { if (await fs.readFile(file, 'utf8') === expected) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Owned fixture marker did not arrive: ' + path.basename(file));
}

test('Native pipe authenticates without publishing its secret and survives split large messages', {skip: process.platform !== 'win32', timeout: 20000}, async t => {
  const f = await fixture(t);
  const discovery = await fetch(f.ready.url + '/json/list').then(response => response.json());
  assert.equal(JSON.stringify(discovery).includes(f.nonce), false);
  assert.equal((await f.auth()).result.pid, f.child.pid);
  for (const size of [80000, 1048576, 4194304]) {
    const value = '한'.repeat(Math.floor(size / 3));
    const result = await f.send('CoSkin.command', {rendererId: 1, method: 'Runtime.evaluate', parameters: {expression: value}}, true);
    assert.equal(result.result.result.value, value);
    assert.equal(f.child.exitCode, null);
  }
  assert.equal((await f.send('CoSkin.list')).result.targets.length, 1);
});

test('Native pipe denies wrong authentication and unsupported main commands', {skip: process.platform !== 'win32', timeout: 15000}, async t => {
  const denied = await fixture(t);
  assert.match((await denied.auth('0'.repeat(64))).error.message, /authentication/);
  const good = await fixture(t);
  await good.auth();
  assert.match((await good.send('Runtime.evaluate', {expression: 'process.exit()'})).error.message, /Unsupported/);
  assert.equal(good.child.exitCode, null);
});

test('Native pipe keeps reading a binding reply while another evaluation awaits it', {skip: process.platform !== 'win32', timeout: 15000}, async t => {
  const f = await fixture(t); await f.auth();
  const waiting = f.send('CoSkin.command', {rendererId: 1, method: 'Runtime.evaluate', parameters: {expression: 'await-binding'}});
  const until = Date.now() + 3000;
  while (!f.events.length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.events[0].params.name, '__coskinRendererEvent');
  await f.send('CoSkin.command', {rendererId: 1, method: 'Runtime.evaluate', parameters: {expression: 'reply-binding'}});
  assert.equal((await waiting).result.result.value, 'binding-resolved');
});

test('Native pipe closes discovery and its session on authenticated disconnect', {skip: process.platform !== 'win32', timeout: 15000}, async t => {
  const f = await fixture(t); await f.auth();
  const closed = new Promise(resolve => f.socket.once('close', resolve));
  assert.deepEqual((await f.send('CoSkin.dispose')).result, {});
  await closed;
  await assert.rejects(fetch(f.ready.url + '/json/list'));
  assert.equal(f.child.exitCode, null);
});

test('Native media registration requires authenticated typed pipe access', {skip: process.platform !== 'win32', timeout: 15000}, async t => {
  const f = await fixture(t);
  const sample = await mediaFile(f);
  const denied = await f.send('CoSkin.media.register', sample.parameters);
  assert.match(denied.error.message, /authentication/);
  assert.equal((await fetch(f.ready.url + '/media/' + '0'.repeat(64))).status, 404);
  assert.equal((await fetch(f.ready.url + '/json/list')).status, 200);
});

test('Native media streams byte-exact full, HEAD and single ranges with private cache and CORS rules', {skip: process.platform !== 'win32', timeout: 20000}, async t => {
  const f = await fixture(t); await f.auth();
  const {bytes, parameters} = await mediaFile(f);
  const {result: media} = await f.send('CoSkin.media.register', parameters);
  assert.equal(media.available, true);
  assert.match(media.token, /^[a-f0-9]{64}$/);
  assert.equal(media.mime, parameters.mime);
  assert.equal(media.length, bytes.length);
  assert.equal(media.url, f.ready.url + '/media/' + media.token);
  assert.equal(media.token.includes(f.nonce), false);
  const full = await fetch(media.url, {headers: {Origin: 'app://-', Cookie: 'unused=private'}});
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('cache-control'), 'no-store');
  assert.equal(full.headers.get('content-type'), 'video/webm');
  assert.equal(full.headers.get('content-length'), String(bytes.length));
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(full.headers.get('access-control-allow-origin'), 'app://-');
  assert.equal(full.headers.get('set-cookie'), null);
  assert.equal(full.headers.get('access-control-allow-credentials'), null);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
  const head = await fetch(media.url, {method: 'HEAD', headers: {Origin: 'null'}});
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal(head.headers.get('access-control-allow-origin'), 'null');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const [header, start, end] of [
    ['bytes=0-65535', 0, 65535], ['Bytes=65536-131071', 65536, 131071],
    ['bytes=299999-', 299999, bytes.length - 1], ['bytes=-17', bytes.length - 17, bytes.length - 1],
    ['bytes=299999-999999', 299999, bytes.length - 1], ['bytes=-999999', 0, bytes.length - 1],
  ]) {
    const response = await fetch(media.url, {headers: {Range: header}});
    assert.equal(response.status, 206, header);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`, header);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1), header);
  }
  for (const range of ['bytes=', 'bytes=-0', 'bytes=300001-', 'bytes=5-4', 'bytes=0-1,3-4', 'items=0-1', 'bytes=9007199254740993-']) {
    const response = await fetch(media.url, {headers: {Range: range}});
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`, range);
    await response.arrayBuffer();
  }
  assert.equal((await fetch(media.url, {headers: {Origin: 'https://example.com'}})).status, 403);
  const options = await fetch(media.url, {method: 'OPTIONS', headers: {Origin: 'app://-',
    'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range'}});
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-headers'), 'Range');
  assert.equal((await fetch(media.url + '?path=' + encodeURIComponent(parameters.path))).status, 404);
  assert.equal((await fetch(f.ready.url + '/media/' + '0'.repeat(64))).status, 404);
  const discoveryText = await fetch(f.ready.url + '/json/list').then(response => response.text());
  assert.equal(discoveryText.includes(media.token), false);
  assert.equal(discoveryText.includes(parameters.path), false);
  assert.equal(discoveryText.includes(f.nonce), false);
});

test('Native media validates path, regular identity, MIME, length, hash and rejects changed or linked sources', {skip: process.platform !== 'win32', timeout: 20000}, async t => {
  const f = await fixture(t); await f.auth();
  const {bytes, parameters} = await mediaFile(f);
  for (const change of [
    {path: 'relative.webm'}, {mime: 'text/html'}, {length: 0}, {length: parameters.length + 1},
    {length: 512 * 1024 * 1024 + 1}, {length: 1.5}, {hash: 'x'.repeat(64)},
    {path: f.directory}, {path: path.join(f.directory, 'missing.webm')}, {other: true},
  ]) {
    const result = await f.send('CoSkin.media.register', {...parameters, ...change});
    assert.ok(result.error, JSON.stringify(change));
  }
  const realDirectory = path.join(f.directory, 'real-media');
  const linkedDirectory = path.join(f.directory, 'linked-media');
  await fs.mkdir(realDirectory);
  await fs.writeFile(path.join(realDirectory, 'source.webm'), bytes);
  await fs.symlink(realDirectory, linkedDirectory, 'junction');
  assert.ok((await f.send('CoSkin.media.register', {...parameters, path: path.join(linkedDirectory, 'source.webm')})).error);
  const {result: media} = await f.send('CoSkin.media.register', parameters);
  await new Promise(resolve => setTimeout(resolve, 20));
  await fs.writeFile(parameters.path, Buffer.alloc(bytes.length, 7));
  assert.equal((await fetch(media.url)).status, 404);
  assert.equal((await f.send('CoSkin.media.release', {token: media.token})).result.ok, true);
  assert.ok((await f.send('CoSkin.media.release', {token: '../source.webm'})).error);
});

test('Native media keeps independent leases and enforces the registration bound without losing a released slot', {skip: process.platform !== 'win32', timeout: 20000}, async t => {
  const f = await fixture(t); await f.auth();
  const {bytes, parameters} = await mediaFile(f);
  const leases = [];
  for (let index = 0; index < 64; index++) {
    const response = await f.send('CoSkin.media.register', parameters);
    assert.equal(response.error, undefined);
    leases.push(response.result);
  }
  assert.equal(new Set(leases.map(lease => lease.token)).size, 64);
  assert.match((await f.send('CoSkin.media.register', parameters)).error.message, /limit/);
  await f.send('CoSkin.media.release', {token: leases[0].token});
  await f.send('CoSkin.media.release', {token: leases[0].token});
  assert.equal((await fetch(leases[0].url)).status, 404);
  const remaining = await fetch(leases[1].url);
  assert.deepEqual(Buffer.from(await remaining.arrayBuffer()), bytes);
  assert.equal((await f.send('CoSkin.media.register', parameters)).result.available, true);
});

test('Native media bounds open streams and release cancels all of that lease without touching its source', {skip: process.platform !== 'win32', timeout: 30000}, async t => {
  const f = await fixture(t); await f.auth();
  const file = path.join(f.directory, 'large.webm');
  const length = 64 * 1024 * 1024;
  const handle = await fs.open(file, 'w'); await handle.truncate(length); await handle.close();
  const hash = crypto.createHash('sha256'), block = Buffer.alloc(64 * 1024);
  for (let index = 0; index < length / block.length; index++) hash.update(block);
  const parameters = {path: file, mime: 'video/webm', length, hash: hash.digest('hex')};
  const {result: media} = await f.send('CoSkin.media.register', parameters);
  const streams = [];
  for (let index = 0; index < 32; index++) {
    const stream = await pausedMedia(media.url);
    assert.equal(stream.response.statusCode, 200);
    streams.push(stream);
  }
  t.after(() => { for (const stream of streams) stream.request.destroy(); });
  assert.equal((await fetch(media.url)).status, 503);
  assert.equal((await f.send('CoSkin.media.release', {token: media.token})).result.ok, true);
  for (const stream of streams) stream.response.resume();
  await Promise.all(streams.map(stream => stream.closed));
  assert.equal((await fetch(media.url)).status, 404);
  assert.equal((await fs.stat(file)).size, length);
  const {result: replacement} = await f.send('CoSkin.media.register', parameters);
  const response = await fetch(replacement.url, {headers: {Range: 'bytes=0-65535'}});
  assert.equal(response.status, 206);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), block);
});

test('Native media streams and registrations close on explicit disposal or authenticated disconnect', {skip: process.platform !== 'win32', timeout: 20000}, async t => {
  for (const ending of ['dispose', 'disconnect']) {
    const f = await fixture(t); await f.auth();
    const file = path.join(f.directory, 'disconnect.webm');
    const length = 64 * 1024 * 1024;
    const handle = await fs.open(file, 'w'); await handle.truncate(length); await handle.close();
    const {result: media} = await f.send('CoSkin.media.register', {path: file, mime: 'video/webm', length, hash: 'a'.repeat(64)});
    const stream = await pausedMedia(media.url);
    t.after(() => stream.request.destroy());
    const disconnected = new Promise(resolve => f.socket.once('close', resolve));
    if (ending === 'dispose') assert.deepEqual((await f.send('CoSkin.dispose')).result, {});
    else f.socket.destroy();
    await disconnected;
    stream.response.resume();
    await stream.closed;
    await assert.rejects(fetch(media.url));
    await assert.rejects(fetch(f.ready.url + '/json/list'));
    assert.equal((await fs.stat(file)).size, length);
    assert.equal(f.child.exitCode, null);
  }
});

test('Native media closes a registration file that finishes opening after its owner disconnected', {skip: process.platform !== 'win32', timeout: 15000}, async t => {
  const f = await fixture(t, 150); await f.auth();
  const {parameters} = await mediaFile(f, 'delayed.webm');
  const registration = f.send('CoSkin.media.register', parameters);
  const rejected = assert.rejects(registration, /disconnected/);
  await waitForFile(path.join(f.directory, 'request.json.media-open-started'), '1');
  f.socket.destroy();
  await rejected;
  await waitForFile(path.join(f.directory, 'request.json.media-open-closed'), '1');
  await assert.rejects(fetch(f.ready.url + '/json/list'));
  assert.equal((await fs.stat(parameters.path)).size, parameters.length);
  assert.equal(f.child.exitCode, null);
});

test('Native media closes a request file that finishes opening after its lease was released', {skip: process.platform !== 'win32', timeout: 15000}, async t => {
  const f = await fixture(t, 150); await f.auth();
  const {parameters} = await mediaFile(f, 'delayed.webm');
  const {result: media} = await f.send('CoSkin.media.register', parameters);
  await waitForFile(path.join(f.directory, 'request.json.media-open-closed'), '1');
  const fetching = fetch(media.url);
  const cancelled = assert.rejects(fetching);
  await waitForFile(path.join(f.directory, 'request.json.media-open-started'), '2');
  await f.send('CoSkin.media.release', {token: media.token});
  await cancelled;
  await waitForFile(path.join(f.directory, 'request.json.media-open-closed'), '2');
  assert.equal((await fetch(media.url)).status, 404);
  assert.equal((await fs.stat(parameters.path)).size, parameters.length);
});
