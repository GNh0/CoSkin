import test from "node:test";
import assert from "node:assert/strict";
import { uploadFile, downloadBytes, downloadBlob } from "../src/renderer/file-transfer.js";
import { MEDIA_LIMITS } from "../src/core/media-limits.js";

const legacyChunk = 24 * 1024;
const largeChunk = 256 * 1024;

function virtualFile(size) {
  return {
    size,
    slice(start, end) {
      return {
        async arrayBuffer() {
          return new Uint8Array(Math.min(end, size) - start).fill(start % 251)
            .buffer;
        },
      };
    },
  };
}

function receiver(size, negotiated) {
  const calls = [];
  let received = 0;
  return {
    calls,
    async request(op, data) {
      if (op === "transfer-begin") {
        calls.push({ op, ...data });
        assert.equal(data.length, size);
        return {
          token: "upload",
          ...(negotiated === undefined ? {} : { chunkBytes: negotiated }),
        };
      }
      if (op === "transfer-append") {
        const bytes = Buffer.from(data.data, "base64");
        assert.equal(data.token, "upload");
        assert.equal(data.offset, received);
        assert.equal(
          bytes.length,
          Math.min(negotiated || legacyChunk, size - received),
        );
        assert.ok(bytes.every((value) => value === received % 251));
        received += bytes.length;
        calls.push({ op, offset: data.offset, length: bytes.length });
        return { ok: true };
      }
      calls.push({ op, ...data });
      if (op === "import" || op === "asset-write") {
        assert.equal(received, size);
        return { stored: true };
      }
      assert.equal(op, "transfer-cancel");
      return { ok: true };
    },
  };
}

test("large upload negotiates 256KiB chunks and commits the exact complete byte sequence", async () => {
  const size = MEDIA_LIMITS.bytes + 13;
  const host = receiver(size, largeChunk);
  assert.deepEqual(await uploadFile(host, virtualFile(size), "asset-write"), {
    stored: true,
  });
  assert.equal(host.calls[0].chunkBytes, largeChunk);
  assert.equal(
    host.calls.filter((call) => call.op === "transfer-append").length,
    Math.ceil(size / largeChunk),
  );
  assert.equal(host.calls.at(-2).op, "asset-write");
  assert.equal(host.calls.at(-1).op, "transfer-cancel");
});

test("an older host that omits chunk negotiation still receives ordered 24KiB import chunks", async () => {
  const size = MEDIA_LIMITS.bytes + 13;
  const host = receiver(size);
  await uploadFile(host, virtualFile(size), "import");
  assert.equal(host.calls[0].chunkBytes, largeChunk);
  assert.equal(
    host.calls.filter((call) => call.op === "transfer-append").length,
    Math.ceil(size / legacyChunk),
  );
  assert.equal(host.calls.at(-1).op, "transfer-cancel");
});

test("small uploads request the legacy chunk size and a failed append cancels without committing", async () => {
  const host = receiver(legacyChunk + 7, legacyChunk);
  await uploadFile(host, virtualFile(legacyChunk + 7), "asset-write");
  assert.equal(host.calls[0].chunkBytes, legacyChunk);
  const calls = [];
  await assert.rejects(
    uploadFile(
      {
        async request(op) {
          calls.push(op);
          if (op === "transfer-begin")
            return { token: "failure", chunkBytes: largeChunk };
          if (op === "transfer-append") throw Error("write failure");
          return { ok: true };
        },
      },
      virtualFile(largeChunk + 1),
      "import",
    ),
    /write failure/,
  );
  assert.deepEqual(calls, [
    "transfer-begin",
    "transfer-append",
    "transfer-cancel",
  ]);
});

test("unsupported negotiated chunks are cancelled and excessive lengths are rejected before upload", async () => {
  const calls = [];
  const host = {
    async request(op) {
      calls.push(op);
      return { token: "bad-size", chunkBytes: 65536 };
    },
  };
  await assert.rejects(uploadFile(host, virtualFile(100), "import"));
  assert.deepEqual(calls, ["transfer-begin", "transfer-cancel"]);
  calls.length = 0;
  await assert.rejects(
    uploadFile(host, virtualFile(MEDIA_LIMITS.transferBytes + 1), "import"),
  );
  assert.deepEqual(calls, []);
});

for (const negotiated of [undefined, largeChunk]) {
  test(`download ${negotiated || legacyChunk}B chunks preserves all bytes and cancels its token`, async () => {
    const size = (negotiated || legacyChunk) * 2 + 7;
    const source = Uint8Array.from({ length: size }, (_, index) => index % 251);
    const calls = [];
    const host = {
      async request(op, data) {
        calls.push({ op, ...data });
        if (op === "transfer-cancel") return { ok: true };
        assert.equal(op, "transfer-read");
        return {
          data: Buffer.from(
            source.subarray(
              data.offset,
              data.offset + (negotiated || legacyChunk),
            ),
          ).toString("base64"),
        };
      },
    };
    const bytes = await downloadBytes(host, {
      token: "download",
      length: size,
      ...(negotiated === undefined ? {} : { chunkBytes: negotiated }),
    });
    assert.deepEqual(bytes, source);
    assert.deepEqual(
      calls
        .filter((call) => call.op === "transfer-read")
        .map((call) => call.offset),
      [0, negotiated || legacyChunk, (negotiated || legacyChunk) * 2],
    );
    assert.equal(calls.at(-1).op, "transfer-cancel");
  });
}

test("a truncated download chunk is rejected and its temporary token is cancelled", async () => {
  const calls = [];
  const host = {
    async request(op) {
      calls.push(op);
      return op === "transfer-read" ? { data: "AA==" } : { ok: true };
    },
  };
  await assert.rejects(
    downloadBytes(host, {
      token: "truncated",
      length: 20,
      chunkBytes: largeChunk,
    }),
  );
  assert.deepEqual(calls, ["transfer-read", "transfer-cancel"]);
});

test("video Blob download preserves negotiated byte order and MIME without a whole-file array", async () => {
  const source = Buffer.alloc(1024 * 1024 + 7, 121), calls = [];
  const host = {async request(op, data) {
    calls.push(op);
    return op === "transfer-read" ? {data: source.subarray(data.offset, data.offset + largeChunk).toString("base64")} : {ok: true};
  }};
  const blob = await downloadBlob(host, {token: "video", length: source.length, chunkBytes: largeChunk, mime: "video/webm"});
  assert.equal(blob.type, "video/webm");
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), source);
  assert.equal(calls.at(-1), "transfer-cancel");
  const aborted = new AbortController(); aborted.abort();
  const before = calls.length;
  await assert.rejects(downloadBlob(host, {token: "aborted", length: 1, mime: "video/webm"}, aborted.signal));
  assert.deepEqual(calls.slice(before), ["transfer-cancel"]);
});
