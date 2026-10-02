using CoSkin;
using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

internal static class LibraryMediaTests
{
    private const string OwnerA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string OwnerB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private const string OwnerLate = "cccccccccccccccccccccccccccccccc";
    private const string OwnerSwitch = "dddddddddddddddddddddddddddddddd";
    private const string OwnerPoster = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    private static readonly TimeSpan Deadline = TimeSpan.FromSeconds(10);

    internal static async Task Run(Action<bool, string> check, string scratch)
    {
        var root = Path.Combine(Path.GetFullPath(scratch), "library-media-tests");
        var assetDirectory = Path.Combine(root, "assets");
        Directory.CreateDirectory(assetDirectory);
        var png = Png();
        var hash = Convert.ToHexString(SHA256.HashData(png)).ToLowerInvariant();
        var assetPath = Path.Combine(assetDirectory, hash + ".bin");
        File.WriteAllBytes(assetPath, png);
        var libraryPath = Path.Combine(root, "library.json");
        var revisionPath = Path.Combine(root, "revision-preserved-1.json");
        const string metadata = "{\"themes\":{},\"bindings\":{},\"enabled\":true}";
        const string revision = "{\"preserve\":\"previous theme revision\"}";
        File.WriteAllText(libraryPath, metadata);
        File.WriteAllText(revisionPath, revision);
        using var library = new Library(root);
        var releases = new ConcurrentDictionary<string, int>(StringComparer.Ordinal);
        var replacementReleases = new ConcurrentDictionary<string, int>(StringComparer.Ordinal);
        var sequence = 0;
        var registrationSequence = 0;
        var validatedRegistrations = 0;

        Task<JsonNode> Request(string operation, string? owner = OwnerPoster, JsonObject? values = null)
        {
            var request = values?.DeepClone().AsObject() ?? new JsonObject();
            request["op"] = operation;
            if (owner is not null) request["requestId"] = owner + ":" + Interlocked.Increment(ref sequence);
            // The production binding parses wire JSON; typed JsonValue<int> is not equivalent to its parsed numeric value.
            var wireRequest = JsonContract.Read(Encoding.UTF8.GetBytes(request.ToJsonString()));
            return library.Handle(wireRequest, _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
        }
        async Task Reject(Func<Task> operation, string message)
        {
            try { await operation().WaitAsync(Deadline); }
            catch (InvalidDataException) { check(true, message); return; }
            check(false, message);
        }
        JsonObject Source(string token) => new()
        {
            ["available"] = true, ["token"] = token,
            ["url"] = "http://127.0.0.1:45129/media/" + token,
            ["mime"] = "image/png", ["length"] = png.Length
        };
        string Token(JsonNode value) => value["token"]!.GetValue<string>();
        Task Release(string token)
        {
            releases.AddOrUpdate(token, 1, (_, count) => count + 1);
            return Task.CompletedTask;
        }
        Task ReleaseReplacement(string token)
        {
            replacementReleases.AddOrUpdate(token, 1, (_, count) => count + 1);
            return Task.CompletedTask;
        }
        int Released(string token) => releases.GetValueOrDefault(token);
        Task<JsonObject> Register(string path, string mime, long length, string actualHash)
        {
            if (path != assetPath || mime != "image/png" || length != png.Length || actualHash != hash)
                throw new InvalidDataException("Verified native source parameters changed");
            Interlocked.Increment(ref validatedRegistrations);
            return Task.FromResult(Source(Interlocked.Increment(ref registrationSequence).ToString("x64")));
        }
        Task<JsonNode> Open(string? owner) => Request("asset-open", owner, new JsonObject { ["hash"] = hash });
        Task<JsonNode> ReleaseToken(string token) => Request("asset-media-release", values: new JsonObject { ["token"] = token });
        library.OpenAssetMedia = Register;
        library.ReleaseAssetMedia = Release;

        var a = Token(await Open(OwnerA));
        var b = Token(await Open(OwnerB));
        var legacy = Token(await Open(null));
        check(validatedRegistrations == 3, "native 등록 delegate는 실제 자산 경로·SHA·MIME·길이를 전달받음");
        await Request("transfer-cancel-owner", OwnerA);
        check(Released(a) == 1 && Released(b) == 0 && Released(legacy) == 0,
            "창 취소는 그 창의 native lease만 해제하고 다른 창과 legacy lease는 보존");
        await ReleaseToken(a);
        await Request("transfer-cancel-owner", OwnerA);
        check(Released(a) == 1, "owner 취소 후 개별 해제·반복 취소는 native delegate를 중복 호출하지 않음");
        var beforeCanceledOpen = validatedRegistrations;
        using (var sourceLock = new FileStream(assetPath, FileMode.Open, FileAccess.Read, FileShare.None))
            await Reject(() => Open(OwnerA), "이미 취소한 owner의 asset-open은 원본 Read와 native 등록 전 거부");
        check(validatedRegistrations == beforeCanceledOpen, "취소 창의 재요청은 등록 delegate를 실행하지 않음");

        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finish = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        library.OpenAssetMedia = (_, _, _, _) => { entered.TrySetResult(); return finish.Task; };
        const string lateToken = "1111111111111111111111111111111111111111111111111111111111111111";
        var late = Open(OwnerLate);
        try
        {
            await entered.Task.WaitAsync(Deadline);
            await Request("transfer-cancel-owner", OwnerLate);
            check(!late.IsCompleted, "owner 취소는 등록 delegate 완료를 기다리지 않고 반환");
        }
        finally { finish.TrySetResult(Source(lateToken)); }
        await Reject(() => late, "취소 이후 늦게 완료된 asset-open은 capability를 반환하지 않음");
        check(Released(lateToken) == 1, "취소 뒤 도착한 native 등록 capability는 정확히 한 번 해제");
        await ReleaseToken(lateToken);
        await Request("transfer-cancel-owner", OwnerLate);
        check(Released(lateToken) == 1 && Released(b) == 0 && Released(legacy) == 0,
            "늦은 등록 cleanup 중복에도 다른 owner와 legacy capability는 보존");

        var switched = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finishSwitched = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        library.OpenAssetMedia = (_, _, _, _) => { switched.TrySetResult(); return finishSwitched.Task; };
        const string switchToken = "2222222222222222222222222222222222222222222222222222222222222222";
        var oldSessionOpen = Open(OwnerSwitch);
        try
        {
            await switched.Task.WaitAsync(Deadline);
            library.OpenAssetMedia = Register;
            library.ReleaseAssetMedia = ReleaseReplacement;
        }
        finally { finishSwitched.TrySetResult(Source(switchToken)); }
        await Reject(() => oldSessionOpen, "native 연결 delegate 교체 중 늦은 등록은 이전 세션 capability를 반환하지 않음");
        check(Released(switchToken) == 1 && replacementReleases.GetValueOrDefault(switchToken) == 0,
            "이전 native 세션의 늦은 capability는 캡처한 이전 release delegate로만 해제");
        await ReleaseToken(switchToken);
        check(Released(switchToken) == 1, "세션 교체 뒤 늦은 capability 개별 재해제도 idempotent");
        var replacement = Token(await Open(OwnerPoster));
        await ReleaseToken(replacement);
        await ReleaseToken(replacement);
        check(replacementReleases.GetValueOrDefault(replacement) == 1 && Released(replacement) == 0,
            "새 세션 capability의 개별 해제 두 번은 새 native delegate 한 번만 호출");
        await ReleaseToken(b);
        await ReleaseToken(b);
        await ReleaseToken(legacy);
        await ReleaseToken(legacy);
        check(Released(b) == 1 && Released(legacy) == 1 &&
              replacementReleases.GetValueOrDefault(b) == 0 && replacementReleases.GetValueOrDefault(legacy) == 0,
            "delegate 교체 전의 다른 owner·legacy lease도 원래 해제 delegate와 일회 소유권을 유지");

        var cacheDirectory = Path.Combine(assetDirectory, PosterCache.DirectoryName);
        var miss = await Request("asset-poster-read", values: new JsonObject { ["hash"] = hash });
        check(miss["available"]?.GetValue<bool>() == false && !Directory.Exists(cacheDirectory),
            "실제 자산의 poster cache miss는 파생 폴더나 전체 원본 전송을 만들지 않음");
        var missingHash = new string('f', 64);
        Directory.CreateDirectory(cacheDirectory);
        var orphanPoster = Path.Combine(cacheDirectory, missingHash + ".png");
        File.WriteAllBytes(orphanPoster, png);
        await Reject(() => Request("asset-poster-read", values: new JsonObject { ["hash"] = missingHash }),
            "원본 SHA 자산이 없는 poster는 파생 PNG가 존재해도 읽기를 거부");
        await Reject(() => Request("asset-poster-write", values: new JsonObject { ["hash"] = missingHash, ["token"] = "not-a-transfer" }),
            "원본 SHA 자산이 없는 poster write는 토큰 소비 전에 거부");
        check(File.ReadAllBytes(orphanPoster).SequenceEqual(png), "원본 없는 poster의 거부는 보존된 파생 파일을 삭제하지 않음");
        await Reject(() => Request("asset-poster-read", values: new JsonObject { ["hash"] = "../library.json" }),
            "poster API의 자산 주소도 SHA 경로 계약을 우회하지 못함");

        var oversized = Token(await Request("transfer-begin", values: new JsonObject { ["length"] = PosterCache.MaxPosterBytes + 1 }));
        await Reject(() => Request("asset-poster-write", values: new JsonObject { ["hash"] = hash, ["token"] = oversized }),
            "poster write는 미완료 대형 토큰도 4MB 소비 한도로 전체 배열 할당 전에 거부");
        await Reject(() => Request("transfer-append", values: new JsonObject { ["token"] = oversized, ["offset"] = 0, ["data"] = "AQ==" }),
            "poster write 소비 제한을 초과한 토큰 예약은 즉시 취소되어 재사용 불가");
        var upload = Token(await Request("transfer-begin", values: new JsonObject { ["length"] = png.Length }));
        await Request("transfer-append", values: new JsonObject { ["token"] = upload, ["offset"] = 0, ["data"] = Convert.ToBase64String(png) });
        var written = await Request("asset-poster-write", values: new JsonObject { ["hash"] = hash, ["token"] = upload });
        check(written["ok"]?.GetValue<bool>() == true, "유효 원본 SHA의 실제 PNG 토큰은 poster API로 저장");
        await Reject(() => Request("transfer-read", values: new JsonObject { ["token"] = upload, ["offset"] = 0 }),
            "저장한 poster upload 토큰은 consume 후 남지 않음");
        var cached = await Request("asset-poster-read", values: new JsonObject { ["hash"] = hash });
        check(cached["available"]?.GetValue<bool>() == true && cached["length"]?.GetValue<int>() == png.Length &&
              cached["mime"]?.GetValue<string>() == "image/png" && cached["chunkBytes"]?.GetValue<int>() == TransferStore.LargeChunkBytes,
            "poster read는 원본이 아닌 작은 PNG의 실제 길이·MIME·조각 계약을 반환");
        var download = Token(cached);
        var read = await Request("transfer-read", values: new JsonObject { ["token"] = download, ["offset"] = 0 });
        check(Convert.FromBase64String(read["data"]!.GetValue<string>()).SequenceEqual(png), "poster read 전송은 저장한 PNG 바이트를 정확히 보존");
        await Request("transfer-cancel", values: new JsonObject { ["token"] = download });
        await Reject(() => Request("transfer-read", values: new JsonObject { ["token"] = download, ["offset"] = 0 }),
            "poster read가 완료된 토큰은 cleanup으로 해제");
        var cachedPath = Path.Combine(cacheDirectory, hash + ".png");
        File.WriteAllText(cachedPath, "corrupt derived PNG");
        var corrupt = await Request("asset-poster-read", values: new JsonObject { ["hash"] = hash });
        check(corrupt["available"]?.GetValue<bool>() == false && File.ReadAllText(cachedPath) == "corrupt derived PNG",
            "손상된 poster는 원본 손실 없이 cache miss로 fallback");
        check(File.ReadAllBytes(assetPath).SequenceEqual(png) &&
              File.ReadAllText(libraryPath) == metadata && File.ReadAllText(revisionPath) == revision,
            "native owner cleanup과 poster API 전체가 실제 원본·라이브러리·리비전을 보존");
        await Request("transfer-cancel-owner", OwnerPoster);
    }

    private static byte[] Png()
    {
        byte[] Chunk(string type, byte[] payload)
        {
            var bytes = new byte[payload.Length + 12];
            BinaryPrimitives.WriteUInt32BigEndian(bytes, (uint)payload.Length);
            Encoding.ASCII.GetBytes(type).CopyTo(bytes, 4); payload.CopyTo(bytes, 8);
            var crc = uint.MaxValue;
            foreach (var value in bytes.AsSpan(4, payload.Length + 4))
            {
                crc ^= value;
                for (var bit = 0; bit < 8; bit++) crc = (crc & 1) != 0 ? 0xedb88320U ^ (crc >> 1) : crc >> 1;
            }
            BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(payload.Length + 8), crc ^ uint.MaxValue);
            return bytes;
        }
        var header = new byte[13]; header[3] = 1; header[7] = 1; header[8] = 8; header[9] = 6;
        using var pixels = new MemoryStream();
        using (var compressed = new ZLibStream(pixels, CompressionLevel.SmallestSize, leaveOpen: true)) compressed.Write([0, 75, 103, 128, 255]);
        return new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }.Concat(Chunk("IHDR", header))
            .Concat(Chunk("IDAT", pixels.ToArray())).Concat(Chunk("IEND", [])).ToArray();
    }
}
